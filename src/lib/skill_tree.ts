import type {
  Translation,
  Node,
  SkillTreeData,
  Group,
  Sprite,
  TranslationFile,
} from "./skill_tree_types";
import { getData } from "../services/wasmDataService";
import { getLanguage } from "./i18n";
import { statValues } from "./values";
import {
  statNamesRuByStringId,
  formatStatTemplate,
  passiveNamesRuById,
  passiveSkillGraphIdToNameRu,
  passiveNodeRu,
} from "./dict";

export let skillTree: SkillTreeData;

export const drawnGroups: Record<number, Group> = {};
export const drawnNodes: Record<number, Node> = {};

export const inverseSprites: Record<string, Sprite> = {};
export const inverseSpritesActive: Record<string, Sprite> = {};

export const inverseTranslations: Record<string, Translation> = {};

export const passiveSkillNameTranslations: Record<number, string> = {};

export function clearTranslations() {
  Object.keys(inverseTranslations).forEach(
    (key) => delete inverseTranslations[key],
  );
  Object.keys(passiveSkillNameTranslations).forEach(
    (key) => delete passiveSkillNameTranslations[Number(key)],
  );
}

export const passiveToTree: Record<number, number> = {};

export type LoadSkillTreeProgress = {
  phase: "parse" | "nodes" | "sprites" | "translations" | "mapping";
  percent: number;
};

export const loadSkillTree = async (
  onProgress?: (progress: LoadSkillTreeProgress) => void,
) => {
  const data = getData();
  onProgress?.({ phase: "parse", percent: 5 });
  skillTree = JSON.parse(data.SkillTree);
  onProgress?.({ phase: "parse", percent: 15 });

  Object.keys(skillTree.groups).forEach((groupId) => {
    const group = skillTree.groups[groupId];
    group.nodes.forEach((nodeId) => {
      const node = skillTree.nodes[nodeId];
      if (node.isProxy) return;
      if ("classStartIndex" in node) return;
      if (node.expansionJewel?.parent) return;
      if (node.isBlighted) return;
      if (node.ascendancyName) return;
      drawnGroups[parseInt(groupId)] = group;
      drawnNodes[parseInt(nodeId)] = node;
    });
  });
  onProgress?.({ phase: "nodes", percent: 35 });

  Object.keys(skillTree.sprites.keystoneInactive["0.3835"].coords).forEach(
    (c) => (inverseSprites[c] = skillTree.sprites.keystoneInactive["0.3835"]),
  );
  Object.keys(skillTree.sprites.notableInactive["0.3835"].coords).forEach(
    (c) => (inverseSprites[c] = skillTree.sprites.notableInactive["0.3835"]),
  );
  Object.keys(skillTree.sprites.normalInactive["0.3835"].coords).forEach(
    (c) => (inverseSprites[c] = skillTree.sprites.normalInactive["0.3835"]),
  );
  Object.keys(skillTree.sprites.masteryInactive["0.3835"].coords).forEach(
    (c) => (inverseSprites[c] = skillTree.sprites.masteryInactive["0.3835"]),
  );
  Object.keys(skillTree.sprites.keystoneActive["0.3835"].coords).forEach(
    (c) =>
      (inverseSpritesActive[c] = skillTree.sprites.keystoneActive["0.3835"]),
  );
  Object.keys(skillTree.sprites.notableActive["0.3835"].coords).forEach(
    (c) =>
      (inverseSpritesActive[c] = skillTree.sprites.notableActive["0.3835"]),
  );
  Object.keys(skillTree.sprites.normalActive["0.3835"].coords).forEach(
    (c) => (inverseSpritesActive[c] = skillTree.sprites.normalActive["0.3835"]),
  );
  Object.keys(skillTree.sprites.masteryInactive["0.3835"].coords).forEach(
    (c) =>
      (inverseSpritesActive[c] = skillTree.sprites.masteryInactive["0.3835"]),
  );
  Object.keys(skillTree.sprites.groupBackground["0.3835"].coords).forEach(
    (c) => (inverseSprites[c] = skillTree.sprites.groupBackground["0.3835"]),
  );
  Object.keys(skillTree.sprites.frame["0.3835"].coords).forEach(
    (c) => (inverseSprites[c] = skillTree.sprites.frame["0.3835"]),
  );
  onProgress?.({ phase: "sprites", percent: 60 });

  await loadTranslations();
  await loadPassiveSkillNameTranslations();
  onProgress?.({ phase: "translations", percent: 85 });

  Object.keys(data.TreeToPassive).forEach((k) => {
    const entry = data.TreeToPassive[parseInt(k)];
    if (entry) passiveToTree[entry.Index] = parseInt(k);
  });
  onProgress?.({ phase: "mapping", percent: 100 });
};

async function loadTranslations() {
  const data = getData();
  // Нужны всегда: index_handlers (per_minute→per_second и т.д.) совпадают с EN stat_translations;
  // без этого RU шаблоны получают сырой ролл из WASM (например 60 вместо 1% в секунду).
  loadEnglishTranslations(data);
}

function loadEnglishTranslations(data?: {
  StatTranslationsJSON?: string;
  PassiveSkillStatTranslationsJSON?: string;
  PassiveSkillAuraStatTranslationsJSON?: string;
}) {
  const d = data ?? getData();
  /** Сначала общие stat_descriptions, затем passive/aura — для одного id на дереве нужен текст из passive_skill_stat_descriptions. */
  const layers: { json?: string; override: boolean }[] = [
    { json: d.StatTranslationsJSON, override: false },
    { json: d.PassiveSkillStatTranslationsJSON, override: true },
    { json: d.PassiveSkillAuraStatTranslationsJSON, override: true },
  ];
  for (const { json, override } of layers) {
    if (typeof json !== "string") continue;
    const translations: TranslationFile = JSON.parse(json);
    translations.descriptors?.forEach((t) => {
      t.ids?.forEach((id) => {
        if (override || !(id in inverseTranslations))
          inverseTranslations[id] = t;
      });
    });
  }
}

async function loadPassiveSkillNameTranslations() {
  // Русский: только наши словари (passiveSkillGraphIdToNameRu и т.д.). Ничего не подгружаем из WASM или сети.
  const lang = getLanguage();
  if (lang !== "ru") return;
}

const indexHandlers: Record<string, number> = {
  negate: -1,
  times_twenty: 1 / 20,
  canonical_stat: 1,
  per_minute_to_per_second: 60,
  milliseconds_to_seconds: 1000,
  display_indexable_support: 1,
  divide_by_one_hundred: 100,
  milliseconds_to_seconds_2dp_if_required: 1000,
  deciseconds_to_seconds: 10,
  old_leech_percent: 1,
  old_leech_permyriad: 10000,
  times_one_point_five: 1 / 1.5,
  "30%_of_value": 100 / 30,
  divide_by_one_thousand: 1000,
  divide_by_twelve: 12,
  divide_by_six: 6,
  per_minute_to_per_second_2dp_if_required: 60,
  "60%_of_value": 100 / 60,
  double: 1 / 2,
  negate_and_double: 1 / -2,
  multiply_by_four: 1 / 4,
  per_minute_to_per_second_0dp: 60,
  milliseconds_to_seconds_0dp: 1000,
  mod_value_to_item_class: 1,
  milliseconds_to_seconds_2dp: 1000,
  multiplicative_damage_modifier: 1,
  divide_by_one_hundred_2dp: 100,
  per_minute_to_per_second_1dp: 60,
  divide_by_one_hundred_2dp_if_required: 100,
  divide_by_ten_1dp_if_required: 10,
  milliseconds_to_seconds_1dp: 1000,
  divide_by_fifty: 50,
  per_minute_to_per_second_2dp: 60,
  divide_by_ten_0dp: 10,
  divide_by_one_hundred_and_negate: -100,
  tree_expansion_jewel_passive: 1,
  passive_hash: 1,
  divide_by_ten_1dp: 10,
  affliction_reward_type: 1,
  divide_by_five: 5,
  metamorphosis_reward_description: 1,
  divide_by_two_0dp: 2,
  divide_by_fifteen_0dp: 15,
  divide_by_three: 3,
  divide_by_twenty_then_double_0dp: 10,
  divide_by_four: 4,
};

export type Point = { x: number; y: number };

export const toCanvasCoords = (
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
  scaling: number,
): Point => ({
  x: (Math.abs(skillTree.min_x) + x + offsetX) / scaling,
  y: (Math.abs(skillTree.min_y) + y + offsetY) / scaling,
});

export const rotateAroundPoint = (
  center: Point,
  target: Point,
  angle: number,
): Point => {
  const rad = (Math.PI / 180) * angle;
  return {
    x:
      Math.cos(rad) * (target.x - center.x) +
      Math.sin(rad) * (target.y - center.y) +
      center.x,
    y:
      Math.cos(rad) * (target.y - center.y) -
      Math.sin(rad) * (target.x - center.x) +
      center.y,
  };
};

export const orbit16Angles = [
  0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330,
];
export const orbit40Angles = [
  0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150,
  160, 170, 180, 190, 200, 210, 220, 225, 230, 240, 250, 260, 270, 280, 290,
  300, 310, 315, 320, 330, 340, 350,
];

export const orbitAngleAt = (orbit: number, index: number): number => {
  const n = skillTree.constants.skillsPerOrbit[orbit];
  if (n === 16) return orbit16Angles[orbit16Angles.length - index] ?? 0;
  if (n === 40) return orbit40Angles[orbit40Angles.length - index] ?? 0;
  return 360 - (360 / n) * index;
};

export const calculateNodePos = (
  node: Node,
  offsetX: number,
  offsetY: number,
  scaling: number,
): Point => {
  if (
    node.group === undefined ||
    node.orbit === undefined ||
    node.orbitIndex === undefined
  )
    return { x: 0, y: 0 };
  const group = skillTree.groups[node.group];
  const angle = orbitAngleAt(node.orbit, node.orbitIndex);
  const groupPos = toCanvasCoords(group.x, group.y, offsetX, offsetY, scaling);
  const nodePos = toCanvasCoords(
    group.x,
    group.y - skillTree.constants.orbitRadii[node.orbit],
    offsetX,
    offsetY,
    scaling,
  );
  return rotateAroundPoint(groupPos, nodePos, angle);
};

export const distance = (p1: Point, p2: Point) =>
  Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

/** Условия + index_handlers как в клиенте PoE (сырой ролл из данных → число в строке тултипа). */
function applyStatIndexHandlers(
  translation: Translation,
  rawRoll: number,
): { finalStat: number; stringTemplate: string } | undefined {
  let idx = -1;
  for (let i = 0; i < translation.list.length; i++) {
    const t = translation.list[i];
    let match = true;
    if (t.conditions?.length) {
      const f = t.conditions[0];
      if (f.min != null && rawRoll < f.min) match = false;
      if (f.max != null && rawRoll > f.max) match = false;
      if (f.negated) match = !match;
    }
    if (match) {
      idx = i;
      break;
    }
  }
  if (idx === -1) return undefined;
  const d = translation.list[idx];
  let finalStat = rawRoll;
  if (d.index_handlers != null) {
    if (Array.isArray(d.index_handlers) && d.index_handlers[0]) {
      d.index_handlers[0].forEach(
        (h) => (finalStat = finalStat / (indexHandlers[h] ?? 1)),
      );
    } else {
      Object.keys(d.index_handlers as Record<string, unknown>).forEach(
        (h) => (finalStat = finalStat / (indexHandlers[h] ?? 1)),
      );
    }
  }
  return { finalStat, stringTemplate: d.string };
}

/**
 * Число для подстановки в русский шаблон {0} (тот же pipeline, что у formatStats для EN).
 * Если нет записи в inverseTranslations — возвращаем rawRoll.
 */
export function displayRollForStatTemplate(
  statId: string,
  rawRoll: number,
): number {
  const tr = inverseTranslations[statId];
  if (!tr) return rawRoll;
  const applied = applyStatIndexHandlers(tr, rawRoll);
  if (!applied) return rawRoll;
  return parseFloat(applied.finalStat.toFixed(2));
}

export const formatStats = (
  translation: Translation,
  stat: number,
): string | undefined => {
  const applied = applyStatIndexHandlers(translation, stat);
  if (!applied) return undefined;
  const { finalStat, stringTemplate } = applied;
  return stringTemplate
    .replace(/\{0(?::(.*?)d(.*?))\}/, "$1" + finalStat + "$2")
    .replace("{0}", parseFloat(finalStat.toFixed(2)).toString());
};

export const baseJewelRadius = 1800;

export const getAffectedNodes = (socket: Node): Node[] => {
  const pos = calculateNodePos(socket, 0, 0, 1);
  return Object.values(drawnNodes).filter(
    (node) => distance(calculateNodePos(node, 0, 0, 1), pos) < baseJewelRadius,
  );
};

type Stat = { Index: number; ID: string; Text: string };
const statCache: Record<number, Stat> = {};
export const getStat = (id: number | string): Stat => {
  const n = typeof id === "string" ? parseInt(id, 10) : id;
  if (!Number.isFinite(n)) {
    return { Index: 0, ID: "", Text: "" };
  }
  if (!(n in statCache)) {
    const row = getData().GetStatByIndex(n) as Stat | null | undefined;
    statCache[n] =
      row ??
      ({
        Index: n,
        ID: String(n),
        Text: "",
      } as Stat);
  }
  return statCache[n];
};

export interface StatConfig {
  min: number;
  id: number;
  weight: number;
}
export interface ReverseSearchConfig {
  jewel: number;
  conqueror: string;
  nodes: number[];
  stats: StatConfig[];
  minTotalWeight: number;
}
export interface SearchWithSeed {
  seed: number;
  weight: number;
  statCounts: Record<number, number>;
  skills: { passive: number; stats: Record<string, number> }[];
}
export interface SearchResults {
  grouped: Record<number, SearchWithSeed[]>;
  raw: SearchWithSeed[];
}

/** Run reverse search in main thread (no worker). onProgress(seed) is called during search. */
export async function runReverseSearch(
  config: ReverseSearchConfig,
  onProgress: (seed: number) => void,
): Promise<SearchResults> {
  const calculator = (
    await import("../services/wasmDataService")
  ).getCalculator();
  const raw = (await calculator.ReverseSearch(
    config.nodes,
    config.stats.map((s) => s.id),
    config.jewel,
    config.conqueror,
    (seed: number) => Promise.resolve(void onProgress(seed)),
  )) as Record<string, Record<string, Record<number, number>>> | undefined;
  if (!raw) return { grouped: {}, raw: [] };

  const searchGrouped: Record<number, SearchWithSeed[]> = {};
  Object.keys(raw).forEach((seedStr) => {
    const seed = parseInt(seedStr, 10);
    let weight = 0;
    const statCounts: Record<number, number> = {};
    const skills = Object.keys(raw[seed])
      .map((skillIDStr) => {
        const skillID = parseInt(skillIDStr, 10);
        const treeId = passiveToTree[skillID];
        if (treeId == null) return null;
        Object.keys(raw[seed][skillID]).forEach((st) => {
          const n = parseInt(st, 10);
          statCounts[n] = (statCounts[n] || 0) + 1;
          weight += config.stats.find((s) => s.id === n)?.weight ?? 0;
        });
        const stats: Record<string, number> = {};
        Object.keys(raw[seed][skillID]).forEach(
          (k) => (stats[k] = raw[seed][skillID][parseInt(k, 10)]),
        );
        return { passive: treeId, stats };
      })
      .filter(
        (s): s is { passive: number; stats: Record<string, number> } =>
          s != null,
      );
    const len = Object.keys(raw[seed]).length;
    const item: SearchWithSeed = { seed, weight, statCounts, skills };
    if (!searchGrouped[len]) searchGrouped[len] = [];
    searchGrouped[len].push(item);
  });

  Object.keys(searchGrouped).forEach((lenStr) => {
    const nLen = parseInt(lenStr, 10);
    searchGrouped[nLen] = searchGrouped[nLen].filter((g) => {
      if (g.weight < config.minTotalWeight) return false;
      for (const stat of config.stats) {
        const count = g.statCounts[stat.id];
        if (
          (count === undefined && stat.min > 0) ||
          (count != null && count < stat.min)
        )
          return false;
      }
      return true;
    });
    if (searchGrouped[nLen].length === 0) delete searchGrouped[nLen];
    else searchGrouped[nLen].sort((a, b) => b.weight - a.weight);
  });

  const rawList = Object.keys(searchGrouped)
    .map((x) => searchGrouped[parseInt(x, 10)])
    .flat()
    .sort((a, b) => b.weight - a.weight);
  return { grouped: searchGrouped, raw: rawList };
}

export const translateStat = (id: number, roll?: number): string => {
  const stat = getStat(id);
  const lang = getLanguage();
  const template = statNamesRuByStringId[stat.ID];
  if (lang === "ru" && template) {
    const displayRoll =
      roll != null ? displayRollForStatTemplate(stat.ID, roll) : undefined;
    return formatStatTemplate(
      template,
      displayRoll != null ? [displayRoll] : [],
    );
  }
  const tr = inverseTranslations[stat.ID];
  if (roll != null && tr) return formatStats(tr, roll) ?? stat.ID;
  let text = stat.Text || stat.ID;
  if (tr?.list?.length) {
    text = tr.list[0].string
      .replace(/\{\d(?::(.*?)d(.*?))\}/, "$1#$2")
      .replace(/\{\d\}/, "#");
  }
  return text;
};

export const translatePassiveSkillName = (
  passiveSkillGraphId: number,
  defaultName?: string,
  lang?: "ru" | "en",
): string => {
  if (!defaultName) return "";
  if (lang !== "ru") return defaultName;
  const fromOfficial = passiveNodeRu[String(passiveSkillGraphId)]?.name;
  return (
    fromOfficial ??
    passiveSkillGraphIdToNameRu[passiveSkillGraphId] ??
    passiveNamesRuById[defaultName] ??
    defaultName
  );
};

const tradeStatNames: Record<number, Record<string, string>> = {
  1: {
    Ahuana: "explicit.pseudo_timeless_jewel_ahuana",
    Xibaqua: "explicit.pseudo_timeless_jewel_xibaqua",
    Doryani: "explicit.pseudo_timeless_jewel_doryani",
    Zerphi: "explicit.pseudo_timeless_jewel_zerphi",
  },
  2: {
    Kaom: "explicit.pseudo_timeless_jewel_kaom",
    Rakiata: "explicit.pseudo_timeless_jewel_rakiata",
    Kiloava: "explicit.pseudo_timeless_jewel_kiloava",
    Akoya: "explicit.pseudo_timeless_jewel_akoya",
  },
  3: {
    Deshret: "explicit.pseudo_timeless_jewel_deshret",
    Balbala: "explicit.pseudo_timeless_jewel_balbala",
    Asenath: "explicit.pseudo_timeless_jewel_asenath",
    Nasima: "explicit.pseudo_timeless_jewel_nasima",
  },
  4: {
    Venarius: "explicit.pseudo_timeless_jewel_venarius",
    Maxarius: "explicit.pseudo_timeless_jewel_maxarius",
    Dominus: "explicit.pseudo_timeless_jewel_dominus",
    Avarius: "explicit.pseudo_timeless_jewel_avarius",
  },
  5: {
    Cadiro: "explicit.pseudo_timeless_jewel_cadiro",
    Victario: "explicit.pseudo_timeless_jewel_victario",
    Chitus: "explicit.pseudo_timeless_jewel_chitus",
    Caspiro: "explicit.pseudo_timeless_jewel_caspiro",
  },
  // Идентификаторы фильтров торговли — проверьте в игре / trade при смене патча
  6: {
    "Black Scythe Training": "explicit.pseudo_timeless_jewel_vorana",
    "Celestial Mathematics": "explicit.pseudo_timeless_jewel_uhtred",
    "The Unbreaking Circle": "explicit.pseudo_timeless_jewel_medved",
  },
};

export const constructQuery = (
  jewel: number,
  conqueror: string,
  result: SearchWithSeed[],
) => {
  const maxLen = 45;
  const maxFilters = 4;
  const maxQuery = maxLen * maxFilters;
  type Q = {
    type: string;
    value: { min: number };
    filters: {
      id: string;
      value: { min: number; max: number };
      disabled?: boolean;
    }[];
    disabled?: boolean;
  };
  const base: Q = { type: "count", value: { min: 1 }, filters: [] };
  let finalQuery: Q[];
  if (result.length === 1) {
    const s: Q = { ...base, filters: [] };
    Object.keys(tradeStatNames[jewel]).forEach((conq) =>
      s.filters.push({
        id: tradeStatNames[jewel][conq],
        value: { min: result[0].seed, max: result[0].seed },
        disabled: conq !== conqueror,
      }),
    );
    finalQuery = [s];
  } else if (result.length > maxQuery) {
    finalQuery = Array.from({ length: maxFilters }, (_, i) => ({
      ...base,
      filters: [],
      disabled: i !== 0,
    }));
    result.slice(0, maxQuery).forEach((r, i) => {
      const idx = Math.floor(i / maxLen);
      finalQuery[idx].filters.push({
        id: tradeStatNames[jewel][conqueror],
        value: { min: r.seed, max: r.seed },
      });
    });
  } else {
    finalQuery = Object.keys(tradeStatNames[jewel]).map((conq) => ({
      ...base,
      filters: result.slice(0, maxLen).map((r) => ({
        id: tradeStatNames[jewel][conq],
        value: { min: r.seed, max: r.seed },
      })),
      disabled: conq !== conqueror,
    }));
  }
  return {
    query: { status: { option: "online" }, stats: finalQuery },
    sort: { price: "asc" as const },
  };
};

export const openTrade = (
  jewel: number,
  conqueror: string,
  results: SearchWithSeed[],
  platform: string,
  league: string,
) => {
  if (!platform || typeof platform !== "string") {
    platform = "PC";
  }

  if (!league || typeof league !== "string") {
    league = "Standard";
  }

  const url = new URL(
    `https://pathofexile.com/trade/search${platform === "PC" ? "" : `/${platform.toLowerCase()}`}/${league}`,
  );
  url.searchParams.set(
    "q",
    JSON.stringify(constructQuery(jewel, conqueror, results)),
  );
  window.open(url, "_blank");
};

export type CombinedResult = {
  id: string;
  rawStat: string;
  stat: string;
  passives: number[];
};

const colorKeys: Record<string, string> = {
  physical: "#c79d93",
  cast: "#b3f8fe",
  fire: "#ff9a77",
  cold: "#93d8ff",
  lightning: "#f8cb76",
  attack: "#da814d",
  life: "#c96e6e",
  chaos: "#d8a7d3",
  unique: "#af6025",
  critical: "#b2a7d6",
};
function colorMessage(message: string): string {
  Object.entries(colorKeys).forEach(([key, value]) => {
    const re = new RegExp(`(${key}(?:$|\\s))|((?:^|\\s)${key})`, "gi");
    message = message.replace(
      re,
      `<span style="color:${value};font-weight:bold">$1$2</span>`,
    );
  });
  return message;
}

export function combineResults(
  rawResults: {
    result: {
      AlternatePassiveSkill?: { StatsKeys?: number[] };
      AlternatePassiveAdditionInformations?: Array<{
        AlternatePassiveAddition?: { StatsKeys?: number[] };
      }>;
    };
    node: number;
  }[],
  withColors: boolean,
  only: "notables" | "passives" | "all",
  jewel: number,
): CombinedResult[] {
  const allPossibleStats: Record<number, Record<string, number>> = JSON.parse(
    getData().PossibleStats,
  );
  const mappedStats: Record<number, number[]> = {};
  rawResults.forEach((r) => {
    const node = skillTree.nodes[r.node];
    if (node?.isKeystone) return;
    if (only === "notables" && !node?.isNotable) return;
    if (only === "passives" && node?.isNotable) return;
    if (r.result.AlternatePassiveSkill?.StatsKeys) {
      r.result.AlternatePassiveSkill.StatsKeys.forEach((key) => {
        mappedStats[key] = [...(mappedStats[key] || []), r.node];
      });
    }
    r.result.AlternatePassiveAdditionInformations?.forEach((info) => {
      info.AlternatePassiveAddition?.StatsKeys?.forEach((key) => {
        mappedStats[key] = [...(mappedStats[key] || []), r.node];
      });
    });
  });
  return Object.keys(mappedStats).map((statID) => {
    const translated = translateStat(parseInt(statID, 10));
    return {
      id: statID,
      rawStat: translated,
      stat: withColors ? colorMessage(translated) : translated,
      passives: mappedStats[parseInt(statID, 10)],
    };
  });
}

export function sortCombined(
  combined: CombinedResult[],
  order: "count" | "alphabet" | "rarity" | "value",
  jewel: number,
): CombinedResult[] {
  const allPossibleStats: Record<number, Record<string, number>> = JSON.parse(
    getData().PossibleStats,
  );
  const arr = [...combined];
  switch (order) {
    case "alphabet":
      return arr.sort((a, b) =>
        a.rawStat
          .replace(/[#+%]/gi, "")
          .trim()
          .toLowerCase()
          .localeCompare(b.rawStat.replace(/[#+%]/gi, "").trim().toLowerCase()),
      );
    case "count":
      return arr.sort((a, b) => b.passives.length - a.passives.length);
    case "rarity":
      return arr.sort(
        (a, b) =>
          (allPossibleStats[jewel]?.[a.id] ?? 0) -
          (allPossibleStats[jewel]?.[b.id] ?? 0),
      );
    case "value":
      return arr.sort((a, b) => {
        const aVal = statValues[parseInt(a.id, 10)] ?? 0;
        const bVal = statValues[parseInt(b.id, 10)] ?? 0;
        if (aVal !== bVal) return bVal - aVal;
        return (
          (allPossibleStats[jewel]?.[a.id] ?? 0) -
          (allPossibleStats[jewel]?.[b.id] ?? 0)
        );
      });
  }
  return arr;
}
