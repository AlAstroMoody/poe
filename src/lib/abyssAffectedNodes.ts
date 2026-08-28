/** Abyss eye jewels (7–10) + Zorath (11): conquered nodes + rolls from PoB LUT. */

import { ref } from "vue";
import { getData } from "@/services/wasmDataService";
import { shortestPathToClassStart } from "./zorathPath";
import type { Node } from "./skill_tree_types";

const MAGIC = 0x32594241; // 'ABY2' little-endian
const ZORATH_MAGIC = 0x31524f5a; // 'ZOR1' little-endian
const GZIP_MAGIC0 = 0x1f;
const GZIP_MAGIC1 = 0x8b;

export function isAbyssEyeJewel(jewelType: number): boolean {
  return jewelType >= 7 && jewelType <= 10;
}

/** Zorath uses path-to-start; not covered by eye geometry LUTs. */
export function isAbyssSpecialJewel(jewelType: number): boolean {
  return jewelType === 11;
}

export function usesNonCircularAbyssArea(jewelType: number): boolean {
  return isAbyssEyeJewel(jewelType) || isAbyssSpecialJewel(jewelType);
}

/** Same tooltip rules as eyes: smalls replace, notables get additions. */
export function isAbyssTimelessJewel(jewelType: number): boolean {
  return usesNonCircularAbyssArea(jewelType);
}

function coerceStatKeysList(raw: unknown): number[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  }
  // Go/crystalline often exposes slices as array-likes: {0: id, length: 1}
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown> & { length?: unknown };
    const len = Number(obj.length);
    if (Number.isFinite(len) && len >= 0 && len < 256) {
      const out: number[] = [];
      for (let i = 0; i < len; i++) {
        const n = Number(obj[i]);
        if (Number.isFinite(n)) out.push(n);
      }
      if (out.length) return out;
    }
    const vals = Object.entries(obj)
      .filter(([k]) => /^\d+$/.test(k))
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, v]) => Number(v))
      .filter((n) => Number.isFinite(n));
    if (vals.length) return vals;
  }
  return undefined;
}

/**
 * Local fallback for Zorath ascendancy APS when WASM index lookup is empty/odd.
 * Keys = alternate_passive_skills._key; StatsKeys = stats._key.
 */
const APS_FALLBACK_BY_KEY: Record<
  number,
  { ID: string; Name: string; StatsKeys: number[] }
> = {
  186: {
    ID: "abyss_special_ascendancy_notable_1",
    Name: "Sanguine Bargain",
    StatsKeys: [23253],
  },
  187: {
    ID: "abyss_special_ascendancy_notable_2",
    Name: "Ephemeral Bolts",
    StatsKeys: [23254],
  },
  188: {
    ID: "abyss_special_ascendancy_notable_3",
    Name: "From Below",
    StatsKeys: [23252],
  },
  189: {
    ID: "abyss_special_ascendancy_notable_4",
    Name: "Spiteful Allies",
    StatsKeys: [23251],
  },
};

/** WASM/crystalline may expose Id vs ID; normalize for tooltip/LUT consumers. */
export function normalizeAlternatePassiveSkill(
  raw: unknown,
  fallbackKey?: number,
):
  | {
      Index?: number;
      ID?: string;
      Name?: string;
      StatsKeys?: number[];
    }
  | undefined {
  const fallback =
    fallbackKey != null ? APS_FALLBACK_BY_KEY[fallbackKey] : undefined;
  if (raw == null || typeof raw !== "object") {
    return fallback ? { ...fallback } : undefined;
  }
  const o = raw as Record<string, unknown>;
  const ID = ((o.ID ?? o.Id) as string | undefined) || fallback?.ID;
  const Name = ((o.Name ?? o.name) as string | undefined) || fallback?.Name;
  const StatsKeys =
    coerceStatKeysList(o.StatsKeys ?? o.statsKeys) ?? fallback?.StatsKeys;
  const Index = o.Index != null ? Number(o.Index) : fallbackKey;
  if (ID == null && Name == null && !(StatsKeys && StatsKeys.length)) {
    return fallback ? { ...fallback } : undefined;
  }
  return { Index, ID, Name, StatsKeys };
}

export type AbyssComponent = {
  /** 1 = replace (APS), 2 = addition (APA) */
  kind: 1 | 2;
  key: number;
  rolls: number[];
};

export type AbyssNodeMods = {
  nodeId: number;
  components: AbyssComponent[];
};

type SocketTable = {
  socketId: number;
  jewelType: number;
  seedMin: number;
  seedMax: number;
  seedInc: number;
  /** seedIndex -> nodeId -> mods */
  bySeedIndex: Map<number, AbyssNodeMods>[];
};

type ZorathTable = {
  seedMin: number;
  seedMax: number;
  seedInc: number;
  seedCount: number;
  nodeIds: Set<number>;
  /** nodeId -> absolute offset of seed-0 mod in bytes */
  nodeModOffset: Map<number, number>;
  /** ascendancyName -> absolute offset of seed-0 pick record */
  ascendancyOffset: Map<string, number>;
  bytes: Uint8Array;
  view: DataView;
};

const cache = new Map<string, SocketTable>();
const inflight = new Map<string, Promise<SocketTable | null>>();

let zorathTable: ZorathTable | null = null;
let zorathInflight: Promise<ZorathTable | null> | null = null;

/** Bumps when a socket/zorath table finishes loading (for Vue computed refresh). */
export const abyssAffectedEpoch = ref(0);

function cacheKey(jewelType: number, socketId: number): string {
  return `${jewelType}:${socketId}`;
}

function urlForSocket(jewelType: number, socketId: number): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/abyss-affected/${jewelType}/${socketId}.bin`;
}

function urlForZorath(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/abyss-affected/11/zorath.bin`;
}

async function gunzip(buf: ArrayBuffer): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is not available");
  }
  const stream = new Blob([buf])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

async function decodePayload(raw: ArrayBuffer): Promise<Uint8Array> {
  const bytes = new Uint8Array(raw);
  if (
    bytes.length >= 2 &&
    bytes[0] === GZIP_MAGIC0 &&
    bytes[1] === GZIP_MAGIC1
  ) {
    return gunzip(raw);
  }
  return bytes;
}

/** Skip one resolved modification: compCount, then (kind u8, key u16, rollCount u8, rolls i16*). */
function skipMod(bytes: Uint8Array, o: number): number {
  const compCount = bytes[o++];
  for (let c = 0; c < compCount; c++) {
    const rollCount = bytes[o + 3];
    o += 4 + rollCount * 2;
  }
  return o;
}

function readMod(
  bytes: Uint8Array,
  view: DataView,
  o: number,
  nodeId: number,
): { mods: AbyssNodeMods; offset: number } {
  const compCount = bytes[o++];
  const components: AbyssComponent[] = [];
  for (let c = 0; c < compCount; c++) {
    const kind = bytes[o++] as 1 | 2;
    const key = view.getUint16(o, true);
    o += 2;
    const rollCount = bytes[o++];
    const rolls: number[] = [];
    for (let r = 0; r < rollCount; r++) {
      rolls.push(view.getInt16(o, true));
      o += 2;
    }
    components.push({ kind, key, rolls });
  }
  return { mods: { nodeId, components }, offset: o };
}

function parseTable(bytes: Uint8Array): SocketTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const magic = view.getUint32(o, true);
  o += 4;
  if (magic !== MAGIC) {
    throw new Error(`bad abyss LUT magic: 0x${magic.toString(16)}`);
  }
  const seedMin = view.getUint16(o, true);
  o += 2;
  const seedMax = view.getUint16(o, true);
  o += 2;
  const seedInc = view.getUint16(o, true);
  o += 2;
  const socketId = view.getUint16(o, true);
  o += 2;
  const jewelType = bytes[o++];
  o += 1; // abyssSize
  const seedCount = (seedMax - seedMin) / seedInc + 1;
  const bySeedIndex: Map<number, AbyssNodeMods>[] = new Array(seedCount);
  for (let si = 0; si < seedCount; si++) {
    const nodeCount = bytes[o++];
    const map = new Map<number, AbyssNodeMods>();
    for (let n = 0; n < nodeCount; n++) {
      const nodeId = view.getUint16(o, true);
      o += 2;
      const { mods, offset } = readMod(bytes, view, o, nodeId);
      o = offset;
      map.set(nodeId, mods);
    }
    bySeedIndex[si] = map;
  }
  if (o !== bytes.byteLength) {
    console.warn(
      "abyss LUT length mismatch",
      { jewelType, socketId, o, len: bytes.byteLength },
    );
  }
  return { socketId, jewelType, seedMin, seedMax, seedInc, bySeedIndex };
}

function parseZorathTable(bytes: Uint8Array): ZorathTable {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const magic = view.getUint32(o, true);
  o += 4;
  if (magic !== ZORATH_MAGIC) {
    throw new Error(`bad zorath LUT magic: 0x${magic.toString(16)}`);
  }
  const seedMin = view.getUint16(o, true);
  o += 2;
  const seedMax = view.getUint16(o, true);
  o += 2;
  const seedInc = view.getUint16(o, true);
  o += 2;
  const nodeCount = view.getUint16(o, true);
  o += 2;
  const ascsAt = view.getUint32(o, true);
  o += 4;
  const seedCount = (seedMax - seedMin) / seedInc + 1;
  const modsBase = 16 + nodeCount * 6;
  const nodeIds = new Set<number>();
  const nodeModOffset = new Map<number, number>();
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = view.getUint16(o, true);
    o += 2;
    const rel = view.getUint32(o, true);
    o += 4;
    nodeIds.add(nodeId);
    nodeModOffset.set(nodeId, modsBase + rel);
  }

  if (
    bytes[ascsAt] !== 0x41 ||
    bytes[ascsAt + 1] !== 0x53 ||
    bytes[ascsAt + 2] !== 0x43 ||
    bytes[ascsAt + 3] !== 0x53
  ) {
    throw new Error("zorath LUT missing ASCS");
  }
  let ao = ascsAt + 4;
  const ascCount = view.getUint16(ao, true);
  ao += 2;
  const ascendancyOffset = new Map<string, number>();
  for (let a = 0; a < ascCount; a++) {
    const nameLen = bytes[ao++];
    const name = new TextDecoder().decode(bytes.subarray(ao, ao + nameLen));
    ao += nameLen;
    ascendancyOffset.set(name, ao);
    for (let si = 0; si < seedCount; si++) {
      const sel = bytes[ao++];
      ao += sel * 2;
    }
  }

  return {
    seedMin,
    seedMax,
    seedInc,
    seedCount,
    nodeIds,
    nodeModOffset,
    ascendancyOffset,
    bytes,
    view,
  };
}

function zorathSeedIndex(table: ZorathTable, seed: number): number | undefined {
  if (
    seed < table.seedMin ||
    seed > table.seedMax ||
    (seed - table.seedMin) % table.seedInc !== 0
  ) {
    return undefined;
  }
  return (seed - table.seedMin) / table.seedInc;
}

function readZorathNodeMods(
  table: ZorathTable,
  nodeId: number,
  seedIndex: number,
): AbyssNodeMods | undefined {
  const base = table.nodeModOffset.get(nodeId);
  if (base == null) return undefined;
  let o = base;
  for (let si = 0; si < seedIndex; si++) {
    o = skipMod(table.bytes, o);
  }
  return readMod(table.bytes, table.view, o, nodeId).mods;
}

function readZorathAscendancyPicks(
  table: ZorathTable,
  ascendancyName: string,
  seedIndex: number,
): number[] {
  const base = table.ascendancyOffset.get(ascendancyName);
  if (base == null) return [];
  let o = base;
  for (let si = 0; si < seedIndex; si++) {
    const sel = table.bytes[o++];
    o += sel * 2;
  }
  const sel = table.bytes[o++];
  const ids: number[] = [];
  for (let i = 0; i < sel; i++) {
    ids.push(table.view.getUint16(o, true));
    o += 2;
  }
  return ids;
}

export async function preloadAbyssSocket(
  socketId: number,
  jewelType: number = 10,
): Promise<SocketTable | null> {
  if (!isAbyssEyeJewel(jewelType)) return null;
  const key = cacheKey(jewelType, socketId);
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = (async () => {
    try {
      const url = urlForSocket(jewelType, socketId);
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status !== 404) {
          console.warn(
            "abyss-affected fetch failed",
            jewelType,
            socketId,
            res.status,
            url,
          );
        }
        return null;
      }
      const raw = await res.arrayBuffer();
      const bytes = await decodePayload(raw);
      const table = parseTable(bytes);
      cache.set(key, table);
      abyssAffectedEpoch.value++;
      return table;
    } catch (e) {
      console.warn("abyss-affected load error", jewelType, socketId, e);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

export async function preloadZorathTable(): Promise<ZorathTable | null> {
  if (zorathTable) return zorathTable;
  if (zorathInflight) return zorathInflight;

  zorathInflight = (async () => {
    try {
      const url = urlForZorath();
      const res = await fetch(url);
      if (!res.ok) {
        console.warn("zorath LUT fetch failed", res.status, url);
        return null;
      }
      const raw = await res.arrayBuffer();
      const bytes = await decodePayload(raw);
      zorathTable = parseZorathTable(bytes);
      abyssAffectedEpoch.value++;
      return zorathTable;
    } catch (e) {
      console.warn("zorath LUT load error", e);
      return null;
    } finally {
      zorathInflight = null;
    }
  })();

  return zorathInflight;
}

export function hasZorathData(): boolean {
  return zorathTable != null;
}

function getSeedMap(
  jewelType: number,
  socketId: number,
  seed: number,
): Map<number, AbyssNodeMods> | undefined {
  const table = cache.get(cacheKey(jewelType, socketId));
  if (!table) return undefined;
  if (
    seed < table.seedMin ||
    seed > table.seedMax ||
    (seed - table.seedMin) % table.seedInc !== 0
  ) {
    return new Map();
  }
  const seedIndex = (seed - table.seedMin) / table.seedInc;
  return table.bySeedIndex[seedIndex] ?? new Map();
}

export function lookupAbyssAffectedSkillIds(
  socketId: number,
  seed: number,
  jewelType: number = 10,
): number[] | undefined {
  const map = getSeedMap(jewelType, socketId, seed);
  if (!map) return undefined;
  return Array.from(map.keys());
}

/** Все ноды, которые хоть при одном сиде попадают под глаз (для поиска / подсветки без сида). */
export function lookupAbyssUnionSkillIds(
  socketId: number,
  jewelType: number,
): number[] | undefined {
  if (!isAbyssEyeJewel(jewelType)) return undefined;
  const table = cache.get(cacheKey(jewelType, socketId));
  if (!table) return undefined;
  const ids = new Set<number>();
  for (const map of table.bySeedIndex) {
    for (const id of map.keys()) ids.add(id);
  }
  return Array.from(ids);
}

const apaStatKeysCache = new Map<number, number[]>();
const apsStatKeysCache = new Map<number, number[]>();

function statKeysForComponent(comp: AbyssComponent): number[] {
  if (comp.kind === 1) {
    let keys = apsStatKeysCache.get(comp.key);
    if (keys) return keys;
    const skill = normalizeAlternatePassiveSkill(
      getData().GetAlternatePassiveSkillByIndex(comp.key),
      comp.key,
    );
    keys = skill?.StatsKeys ?? [];
    apsStatKeysCache.set(comp.key, keys);
    return keys;
  }
  let keys = apaStatKeysCache.get(comp.key);
  if (keys) return keys;
  const addition = getData().GetAlternatePassiveAdditionByIndex(comp.key) as
    | { StatsKeys?: unknown; statsKeys?: unknown }
    | undefined;
  keys =
    coerceStatKeysList(addition?.StatsKeys ?? addition?.statsKeys) ?? [];
  apaStatKeysCache.set(comp.key, keys);
  return keys;
}

function collectStatRollsFromMods(
  mods: AbyssNodeMods,
  statMap: Set<number>,
): Record<number, number> | null {
  const out: Record<number, number> = {};
  let matched = false;
  for (const comp of mods.components) {
    const keys = statKeysForComponent(comp);
    if (!keys.length) continue;
    if (!keys.some((k) => statMap.has(k))) continue;
    matched = true;
    keys.forEach((k, i) => {
      const roll = comp.rolls[i];
      if (roll != null) out[k] = roll;
    });
  }
  return matched ? out : null;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Reverse search по LUT глаза (7–10): seed → passive_skills._key → stat._key → roll.
 * Не использует круговой радиус и Go-калькулятор timeless.
 * Чанками отдаёт управление UI (прелоадер).
 */
export async function reverseSearchAbyssEyeLut(
  socketId: number,
  jewelType: number,
  searchedStatIds: number[],
  disabledTreeSkills: ReadonlySet<number>,
  treeSkillToPassiveIndex: (treeSkillId: number) => number | undefined,
  onProgress?: (seed: number) => void,
): Promise<Record<number, Record<number, Record<number, number>>>> {
  const table = cache.get(cacheKey(jewelType, socketId));
  if (!table || !searchedStatIds.length) return {};
  const statMap = new Set(searchedStatIds);
  const results: Record<number, Record<number, Record<number, number>>> = {};
  const chunk = 48;

  for (let si = 0; si < table.bySeedIndex.length; si++) {
    const map = table.bySeedIndex[si];
    if (map?.size) {
      const seed = table.seedMin + si * table.seedInc;
      for (const [treeSkillId, mods] of map) {
        if (disabledTreeSkills.has(treeSkillId)) continue;
        const rolls = collectStatRollsFromMods(mods, statMap);
        if (!rolls) continue;
        const passiveIndex = treeSkillToPassiveIndex(treeSkillId);
        if (passiveIndex == null) continue;
        if (!results[seed]) results[seed] = {};
        results[seed][passiveIndex] = {
          ...(results[seed][passiveIndex] ?? {}),
          ...rolls,
        };
      }
      if (si % chunk === 0) {
        onProgress?.(seed);
        await yieldToUi();
      }
    } else if (si % chunk === 0) {
      await yieldToUi();
    }
  }
  return results;
}

/**
 * Reverse search по LUT Zorath (11): ноды на пути к старту класса (+ ascendancy pick).
 */
export async function reverseSearchZorathLut(
  treeNodes: Record<string, Node>,
  socketId: number,
  classStartIndex: number,
  ascendancyName: string | undefined,
  searchedStatIds: number[],
  disabledTreeSkills: ReadonlySet<number>,
  treeSkillToPassiveIndex: (treeSkillId: number) => number | undefined,
  onProgress?: (seed: number) => void,
): Promise<Record<number, Record<number, Record<number, number>>>> {
  const table = zorathTable;
  if (!table || !searchedStatIds.length) return {};
  const statMap = new Set(searchedStatIds);
  const path = shortestPathToClassStart(
    treeNodes,
    socketId,
    classStartIndex,
  ).filter((id) => id !== socketId);
  const results: Record<number, Record<number, Record<number, number>>> = {};
  const chunk = 48;

  for (let si = 0; si < table.seedCount; si++) {
    const seed = table.seedMin + si * table.seedInc;
    const nodeIds = new Set<number>();
    for (const id of path) {
      if (table.nodeIds.has(id)) nodeIds.add(id);
    }
    if (ascendancyName) {
      for (const id of readZorathAscendancyPicks(table, ascendancyName, si)) {
        nodeIds.add(id);
      }
    }
    for (const treeSkillId of nodeIds) {
      if (disabledTreeSkills.has(treeSkillId)) continue;
      const mods = readZorathNodeMods(table, treeSkillId, si);
      if (!mods) continue;
      const rolls = collectStatRollsFromMods(mods, statMap);
      if (!rolls) continue;
      const passiveIndex = treeSkillToPassiveIndex(treeSkillId);
      if (passiveIndex == null) continue;
      if (!results[seed]) results[seed] = {};
      results[seed][passiveIndex] = {
        ...(results[seed][passiveIndex] ?? {}),
        ...rolls,
      };
    }
    if (si % chunk === 0) {
      onProgress?.(seed);
      await yieldToUi();
    }
  }
  return results;
}

/**
 * Zorath affected skills: path nodes present in LUT + ascendancy seed pick.
 * Returns undefined while LUT is still loading (caller may still show path-only).
 */
export function lookupZorathAffectedSkillIds(
  treeNodes: Record<string, Node>,
  socketId: number,
  seed: number,
  classStartIndex: number,
  ascendancyName?: string,
): number[] | undefined {
  const table = zorathTable;
  if (!table) return undefined;
  const seedIndex = zorathSeedIndex(table, seed);
  if (seedIndex == null) return [];

  const path = shortestPathToClassStart(
    treeNodes,
    socketId,
    classStartIndex,
  );
  const ids = new Set<number>();
  for (const id of path) {
    if (id === socketId) continue;
    if (table.nodeIds.has(id)) ids.add(id);
  }
  if (ascendancyName) {
    for (const id of readZorathAscendancyPicks(
      table,
      ascendancyName,
      seedIndex,
    )) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

/** Path nodes for highlight before / without LUT (no ascendancy pick). */
export function lookupZorathPathSkillIds(
  treeNodes: Record<string, Node>,
  socketId: number,
  classStartIndex: number,
): number[] {
  const path = shortestPathToClassStart(
    treeNodes,
    socketId,
    classStartIndex,
  );
  return path.filter((id) => id !== socketId);
}

function modsToCalculateResult(mods: AbyssNodeMods | undefined):
  | {
      AlternatePassiveSkill?: Record<string, unknown>;
      StatRolls?: Record<number, number>;
      AlternatePassiveAdditionInformations?: {
        AlternatePassiveAddition?: Record<string, unknown>;
        StatRolls?: Record<number, number>;
      }[];
    }
  | undefined {
  if (!mods) return {};
  const data = getData();
  let skill: Record<string, unknown> | undefined;
  let skillRolls: Record<number, number> | undefined;
  const additions: {
    AlternatePassiveAddition?: Record<string, unknown>;
    StatRolls?: Record<number, number>;
  }[] = [];

  for (const comp of mods.components) {
    const rolls: Record<number, number> = {};
    comp.rolls.forEach((r, i) => {
      rolls[i] = r;
    });
    if (comp.kind === 1) {
      skill = normalizeAlternatePassiveSkill(
        data.GetAlternatePassiveSkillByIndex(comp.key),
        comp.key,
      ) as Record<string, unknown> | undefined;
      skillRolls = rolls;
    } else if (comp.kind === 2) {
      const addition = data.GetAlternatePassiveAdditionByIndex(comp.key) as
        | Record<string, unknown>
        | undefined;
      const statsKeys = coerceStatKeysList(
        addition?.StatsKeys ?? (addition as { statsKeys?: unknown })?.statsKeys,
      );
      additions.push({
        AlternatePassiveAddition: addition
          ? { ...addition, StatsKeys: statsKeys ?? addition.StatsKeys }
          : undefined,
        StatRolls: rolls,
      });
    }
  }

  return {
    AlternatePassiveSkill: skill,
    StatRolls: skillRolls,
    AlternatePassiveAdditionInformations: additions.length
      ? additions
      : undefined,
  };
}

/** Build a Calculate-compatible result from the Abyss LUT for one tree skill. */
export function lookupAbyssCalculateResult(
  socketId: number,
  seed: number,
  jewelType: number,
  treeSkillId: number,
):
  | {
      AlternatePassiveSkill?: Record<string, unknown>;
      StatRolls?: Record<number, number>;
      AlternatePassiveAdditionInformations?: {
        AlternatePassiveAddition?: Record<string, unknown>;
        StatRolls?: Record<number, number>;
      }[];
    }
  | undefined {
  if (isAbyssSpecialJewel(jewelType)) {
    const table = zorathTable;
    if (!table) return undefined;
    const seedIndex = zorathSeedIndex(table, seed);
    if (seedIndex == null) return {};
    if (!table.nodeIds.has(treeSkillId)) return {};
    return modsToCalculateResult(
      readZorathNodeMods(table, treeSkillId, seedIndex),
    );
  }

  const map = getSeedMap(jewelType, socketId, seed);
  if (!map) return undefined;
  const mods = map.get(treeSkillId);
  if (!mods) {
    return {};
  }
  return modsToCalculateResult(mods);
}

export function hasAbyssSocketData(
  socketId: number,
  jewelType: number,
): boolean {
  if (isAbyssSpecialJewel(jewelType)) return zorathTable != null;
  return cache.has(cacheKey(jewelType, socketId));
}
