/**
 * §2.1–2.2: прогон выборки через НАСТОЯЩИЙ продовый расчёт
 * (`getAffectedNodes` + `calculateTimelessForTreeSkill`) и сборка снапшота.
 *
 * Снапшот = детерминированный набор кейсов + строки эффекта; по нему
 * строятся Markdown-отчёт и baseline-diff.
 */
import type { Node as TreeNode } from "@/lib/skill_tree_types";
import { getData } from "@/services/wasmDataService";
import {
  getAffectedNodes,
  skillTree,
  translateTreeSkillName,
} from "@/lib/skill_tree";
import {
  calculateTimelessForTreeSkill,
  getPassiveRowByTreeSkill,
  isPassiveSkillStub,
} from "@/lib/timelessJewelCalculate";
import {
  hasAbyssSocketData,
  isAbyssEyeJewel,
  isAbyssSpecialJewel,
  preloadAbyssSocket,
  preloadZorathTable,
} from "@/lib/abyssAffectedNodes";
import { bootstrapWasmData } from "./harness";
import {
  buildCases,
  jewelSeedRange,
  jewelSocketIds,
  makeSmokeCase,
  mulberry32,
  type SmokeCase,
} from "./cases";
import { formatResultLines, type CalcResult } from "./format";
import { renderReport } from "./report";

export type SmokeNode = {
  skill: number;
  nameRu: string;
  nameEn: string;
  kind: "keystone" | "notable" | "small";
  attributeSmall?: boolean;
  stub?: boolean;
  source: "lut" | "wasm";
  replace: string[];
  additions: string[];
  replaceKeys: number[];
  additionKeys: number[][];
};

export type SmokeCaseResult = SmokeCase & {
  totalAffected: number;
  nodes: SmokeNode[];
};

export type SmokeSnapshot = {
  caseSeed: number;
  lang: "ru" | "en";
  cases: SmokeCaseResult[];
};

export type RunSmokeOptions = {
  caseSeed?: number;
  lang?: "ru" | "en";
  maxNodesPerCase?: number;
  maxCases?: number;
  /** Сколько Zorath-кейсов пытаться собрать с гарантированным покрытием нод. */
  zorathCases?: number;
};

/**
 * Дефолтный лимит нод на кейс. Держит baseline КОМПАКТНЫМ (выборочный набор),
 * но покрытие всех jewel/seed/socket сохраняется: смещение вглубь кейса ограничено.
 * Именованные ноды (keystone/notable) приоритетны — см. `selectNodes`.
 */
const DEFAULT_MAX_NODES_PER_CASE = 12;

/**
 * Выборочный набор нод кейса заданного размера.
 * Сначала берём keystone/notable (наиболее ценны и малочисленны), затем — равномерно
 * распределённые по skill id мелкие ноды (а не первые N, чтобы не смещаться к низам
 * и не «съезжать» при добавлении ноды с меньшим id в новом патче).
 */
function selectNodes(nodes: SmokeNode[], cap: number): SmokeNode[] {
  if (cap <= 0 || nodes.length <= cap) return nodes;
  const named = nodes.filter((n) => n.kind !== "small");
  const small = nodes.filter((n) => n.kind === "small");
  const out: SmokeNode[] = named.slice(0, cap);
  const rest = cap - out.length;
  if (rest > 0 && small.length > 0) {
    const step = small.length / rest;
    for (let i = 0; i < rest; i++) {
      const idx = Math.floor(i * step);
      if (idx < small.length) out.push(small[idx]!);
    }
  }
  return out.sort((a, b) => a.skill - b.skill);
}

function nodeKind(node: TreeNode): SmokeNode["kind"] {
  if (node.isKeystone) return "keystone";
  if (node.isNotable) return "notable";
  return "small";
}

/** Militant Faith: attribute-small vs non-attribute small (см. бэклог §2.1). */
function isAttributeSmall(node: TreeNode): boolean {
  if (node.isNotable || node.isKeystone) return false;
  return (node.stats ?? []).some((s) =>
    /to (Strength|Dexterity|Intelligence|All Attributes)/i.test(s),
  );
}

/** Предзагрузка LUT глаз (7–10): только для сокетов, попавших в выборку. */
async function preloadEyeLuts(cases: SmokeCase[]): Promise<void> {
  for (const jewel of [7, 8, 9, 10]) {
    const sockets = new Set(
      cases.filter((c) => c.jewel === jewel).map((c) => c.socket),
    );
    for (const socket of sockets) {
      await preloadAbyssSocket(socket, jewel);
    }
  }
}

/**
 * Zorath (11) считается только по LUT-пути сокет→старт класса. Строим кейсы
 * после загрузки LUT и берём лишь те (сокет, класс), где реально есть ноды, —
 * иначе случайные сокеты дают пустые кейсы. Детерминированно (порядок сокетов).
 */
async function buildZorathCases(
  caseSeed: number,
  count: number,
): Promise<SmokeCase[]> {
  if (count <= 0) return [];
  const range = jewelSeedRange(11);
  if (!range) return [];
  await preloadZorathTable();

  const data = getData();
  const sockets = jewelSocketIds();
  const rng = mulberry32((caseSeed ^ 0x9e3779b9) >>> 0);
  const seeds = [
    range.Min,
    Math.floor((range.Min + range.Max) / 2),
    range.Max,
  ];
  const out: SmokeCase[] = [];

  outer: for (const socket of sockets) {
    const socketNode = skillTree.nodes[socket];
    if (!socketNode) continue;
    for (let cls = 0; cls < 7; cls++) {
      const probe = getAffectedNodes(socketNode, {
        jewelType: 11,
        seed: seeds[0]!,
        classStartIndex: cls,
      });
      if (probe.length === 0) continue;
      const seed = seeds[Math.floor(rng() * seeds.length)]!;
      out.push(makeSmokeCase(data, 11, "Zorath", socket, seed, cls));
      if (out.length >= count) break outer;
    }
  }
  return out;
}

/** Прогнать выборку и вернуть снапшот + готовый Markdown-отчёт. */
export async function runSmoke(
  options: RunSmokeOptions = {},
): Promise<{ snapshot: SmokeSnapshot; markdown: string }> {
  await bootstrapWasmData();

  const caseSeed = options.caseSeed ?? 1;
  const lang = options.lang ?? "ru";
  const maxNodesPerCase =
    options.maxNodesPerCase ?? DEFAULT_MAX_NODES_PER_CASE;

  const data = getData();
  const baseCases = await buildCases({ seed: caseSeed });
  await preloadEyeLuts(baseCases);
  const zorathCases = await buildZorathCases(
    caseSeed,
    options.zorathCases ?? 4,
  );

  let cases = [...baseCases, ...zorathCases];
  if (options.maxCases != null) cases = cases.slice(0, options.maxCases);

  const results: SmokeCaseResult[] = [];

  for (const c of cases) {
    const socketNode = skillTree.nodes[c.socket];
    if (!socketNode) {
      results.push({ ...c, totalAffected: 0, nodes: [] });
      continue;
    }

    const affected = getAffectedNodes(socketNode, {
      jewelType: c.jewel,
      seed: c.seed,
      classStartIndex: c.classStartIndex ?? 0,
      ascendancyName: c.ascendancyName ?? "",
    }).filter(
      (n) =>
        !n.isJewelSocket &&
        !n.isMastery &&
        n.skill != null &&
        data.TreeToPassive[n.skill] != null,
    );

    const isAbyss = isAbyssEyeJewel(c.jewel) || isAbyssSpecialJewel(c.jewel);
    const source: SmokeNode["source"] =
      isAbyss && hasAbyssSocketData(c.socket, c.jewel) ? "lut" : "wasm";

    const nodes: SmokeNode[] = [];
    for (const n of affected) {
      const skill = n.skill!;
      const result = calculateTimelessForTreeSkill(
        skill,
        c.seed,
        c.jewel,
        c.conqueror,
        c.socket,
      ) as CalcResult | undefined;
      if (result == null) continue;

      const formatted = formatResultLines(result, lang);
      const hasContent =
        formatted.replace.length > 0 ||
        formatted.additions.length > 0 ||
        result.AlternatePassiveSkill != null;
      if (!hasContent) continue;

      nodes.push({
        skill,
        nameEn: n.name ?? "",
        nameRu: translateTreeSkillName(skill, "ru"),
        kind: nodeKind(n),
        attributeSmall: isAttributeSmall(n) || undefined,
        stub: isPassiveSkillStub(getPassiveRowByTreeSkill(skill)) || undefined,
        source,
        replace: formatted.replace,
        additions: formatted.additions,
        replaceKeys: formatted.replaceKeys,
        additionKeys: formatted.additionKeys,
      });
    }

    nodes.sort((a, b) => a.skill - b.skill);

    results.push({
      ...c,
      totalAffected: nodes.length,
      nodes: selectNodes(nodes, maxNodesPerCase),
    });
  }

  const snapshot: SmokeSnapshot = { caseSeed, lang, cases: results };
  return { snapshot, markdown: renderReport(snapshot) };
}
