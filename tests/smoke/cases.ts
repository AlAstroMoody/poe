/**
 * §2.1: воспроизводимая выборка кейсов для смоук-теста данных.
 *
 * Выборка зависит только от `seed` (mulberry32), поэтому один и тот же `--seed`
 * даёт одинаковый набор кейсов — можно коммитить baseline и ловить регрессии.
 *
 * Классические/глазные самоцветы (1–10) строятся здесь. Zorath (11) строится в
 * `run.ts` ПОСЛЕ загрузки LUT: его путь сокет→старт класса нужно проверять на
 * реальное покрытие (иначе половина случайных сокетов даёт 0 нод).
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { getData, type WasmData } from "@/services/wasmDataService";
import { skillTree } from "@/lib/skill_tree";
import { conquerorLabel, jewelLabel } from "@/lib/dict";
import { PUBLIC_DIR } from "./harness";

export type SmokeCase = {
  id: string;
  jewel: number;
  jewelRu: string;
  jewelEn: string;
  conqueror: string;
  conquerorRu: string;
  seed: number;
  /** tree skill id сокета (в UI это `?location=`). */
  socket: number;
  socketName: string;
  /** Zorath (11): индекс старта класса и ascendancy. */
  classStartIndex?: number;
  ascendancyName?: string;
};

export type BuildCasesOptions = {
  seed: number;
  conquerorsPerJewel?: number;
  socketsPerJewel?: number;
  seedsPerJewel?: number;
};

/** Mulberry32 — маленький детерминированный PRNG (не зависит от платформы). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Случайные `n` элементов без повторов (детерминированно от rng). */
export function pick<T>(rng: () => number, arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    const i = Math.floor(rng() * copy.length);
    out.push(copy.splice(i, 1)[0]!);
  }
  return out;
}

/** Все сокеты дерева (tree skill id), отсортированы для детерминизма. */
export function jewelSocketIds(): number[] {
  const ids = new Set<number>();
  for (const node of Object.values(skillTree.nodes)) {
    if (node.isJewelSocket && node.skill != null) ids.add(node.skill);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Сокеты глаза, для которых есть LUT (`public/abyss-affected/<jewel>/*.bin`). */
async function abyssLutSocketIds(jewel: number): Promise<number[]> {
  try {
    const dir = path.join(PUBLIC_DIR, "abyss-affected", String(jewel));
    const files = await readdir(dir);
    return files
      .filter((f) => f.endsWith(".bin"))
      .map((f) => Number(f.replace(/\.bin$/, "")))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function rngSeedInRange(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Собрать кейс (используется и для Zorath в run.ts). */
export function makeSmokeCase(
  data: WasmData,
  jewel: number,
  conqueror: string,
  socket: number,
  seed: number,
  classStartIndex?: number,
): SmokeCase {
  const enLabel = data.TimelessJewels[jewel] ?? String(jewel);
  const socketName = skillTree.nodes[socket]?.name ?? String(socket);
  return {
    id: `${jewel}-${conqueror}-${socket}-${seed}-${classStartIndex ?? ""}`,
    jewel,
    jewelRu: jewelLabel(jewel, enLabel, "ru"),
    jewelEn: enLabel,
    conqueror,
    conquerorRu: conquerorLabel(conqueror, "ru"),
    seed,
    socket,
    socketName,
    classStartIndex,
  };
}

/**
 * Кейсы для самоцветов 1–10 (легион + глаза). Требует уже поднятых
 * WASM-данных и дерева (`bootstrapWasmData`).
 */
export async function buildCases(
  options: BuildCasesOptions,
): Promise<SmokeCase[]> {
  const data = getData();
  const rng = mulberry32(options.seed);
  const conquerorsPerJewel = options.conquerorsPerJewel ?? 2;
  const socketsPerJewel = options.socketsPerJewel ?? 2;
  const seedsPerJewel = options.seedsPerJewel ?? 2;

  const classicSockets = jewelSocketIds();
  const cases: SmokeCase[] = [];

  for (let jewel = 1; jewel <= 10; jewel++) {
    const range = data.TimelessJewelSeedRanges[jewel];
    if (!range) continue;
    const conquerors = Object.entries(data.TimelessJewelConquerors[jewel] ?? {})
      .filter(([, v]) => v != null)
      .map(([k]) => k)
      .sort();

    const isEye = jewel >= 7 && jewel <= 10;
    const socketPool = isEye ? await abyssLutSocketIds(jewel) : classicSockets;
    if (socketPool.length === 0) continue;

    const sockets = pick(rng, socketPool, socketsPerJewel);
    const jewelConquerors =
      conquerors.length > 0 ? conquerors : ["Unknown"];
    const chosenConquerors = pick(rng, jewelConquerors, conquerorsPerJewel);

    for (const conqueror of chosenConquerors) {
      for (const socket of sockets) {
        for (let s = 0; s < seedsPerJewel; s++) {
          const seed = rngSeedInRange(rng, range.Min, range.Max);
          cases.push(makeSmokeCase(data, jewel, conqueror, socket, seed));
        }
      }
    }
  }

  return cases;
}

/** Диапазон сидов самоцвета (для генерации Zorath-кейсов). */
export function jewelSeedRange(
  jewel: number,
): { Min: number; Max: number } | undefined {
  return getData().TimelessJewelSeedRanges[jewel];
}
