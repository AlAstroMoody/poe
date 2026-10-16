/**
 * §2.2 / §2.3: рендер человекочитаемого Markdown-отчёта и diff с baseline.
 */
import type { SmokeCaseResult, SmokeNode, SmokeSnapshot } from "./run";

export type DiffResult = {
  added: string[];
  removed: string[];
  changed: string[];
  identical: boolean;
};

/**
 * Компактный baseline-снапшот — ТОЛЬКО регрессионный сигнал.
 *
 * Осознанно НЕ хранит отображаемые строки (`nameRu`/`nameEn`/`socketName`/`jewelRu`…):
 * они меняются между версиями игры и локализациями и не относятся к расчёту,
 * поэтому раздували baseline (~210 КБ) и давали ложные diff'ы. Полный человекочитаемый
 * вид со всеми именами остаётся в артефакте-отчёте (`artifacts/smoke-report.md`).
 *
 * Пишется минифицированным (`JSON.stringify` без отступов) — файл коммитится.
 */
export type BaselineNode = {
  skill: number;
  kind: SmokeNode["kind"];
  source: SmokeNode["source"];
  attributeSmall?: boolean;
  stub?: boolean;
  replace: string[];
  additions: string[];
};

export type BaselineCase = {
  id: string;
  jewel: number;
  conqueror: string;
  seed: number;
  socket: number;
  classStartIndex?: number;
  ascendancyName?: string;
  nodes: BaselineNode[];
};

export type BaselineSnapshot = {
  /** Версия схемы baseline — менять при изменении формата. */
  v: 1;
  caseSeed: number;
  lang: "ru" | "en";
  cases: BaselineCase[];
};

/** Спроецировать полный снапшот (с именами) в компактный baseline (только сигнал). */
export function toBaselineSnapshot(s: SmokeSnapshot): BaselineSnapshot {
  return {
    v: 1,
    caseSeed: s.caseSeed,
    lang: s.lang,
    cases: s.cases.map((c) => {
      const out: BaselineCase = {
        id: c.id,
        jewel: c.jewel,
        conqueror: c.conqueror,
        seed: c.seed,
        socket: c.socket,
        nodes: c.nodes.map((n) => {
          const bn: BaselineNode = {
            skill: n.skill,
            kind: n.kind,
            source: n.source,
            replace: n.replace,
            additions: n.additions,
          };
          if (n.attributeSmall) bn.attributeSmall = true;
          if (n.stub) bn.stub = true;
          return bn;
        }),
      };
      if (c.classStartIndex != null) out.classStartIndex = c.classStartIndex;
      if (c.ascendancyName) out.ascendancyName = c.ascendancyName;
      return out;
    }),
  };
}

function baselineNodeSignature(n: BaselineNode): string {
  return JSON.stringify({
    kind: n.kind,
    attributeSmall: n.attributeSmall ?? false,
    stub: n.stub ?? false,
    source: n.source,
    replace: n.replace,
    additions: n.additions,
  });
}

/** Стабильная подпись кейса (без имён и времени) — по ней сравниваем baseline. */
export function baselineCaseSignature(c: BaselineCase): string {
  return JSON.stringify({
    jewel: c.jewel,
    conqueror: c.conqueror,
    seed: c.seed,
    socket: c.socket,
    classStartIndex: c.classStartIndex ?? null,
    nodes: c.nodes.map((n) => ({
      skill: n.skill,
      sig: baselineNodeSignature(n),
    })),
  });
}

/** Сравнить два компактных baseline по id кейсов: добавленные/пропавшие/изменившиеся. */
export function diffBaselineSnapshots(
  baseline: BaselineSnapshot,
  next: BaselineSnapshot,
): DiffResult {
  const baseMap = new Map(baseline.cases.map((c) => [c.id, c]));
  const nextMap = new Map(next.cases.map((c) => [c.id, c]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [id, c] of nextMap) {
    const base = baseMap.get(id);
    if (!base) added.push(id);
    else if (baselineCaseSignature(base) !== baselineCaseSignature(c))
      changed.push(id);
  }
  for (const id of baseMap.keys()) {
    if (!nextMap.has(id)) removed.push(id);
  }

  added.sort();
  removed.sort();
  changed.sort();
  return {
    added,
    removed,
    changed,
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

function siteBase(): string {
  const raw = process.env.SMOKE_SITE_BASE?.trim() ?? "/";
  return raw.endsWith("/") ? raw : raw + "/";
}

function caseUrl(c: SmokeCaseResult): string {
  const params = new URLSearchParams({
    jewel: String(c.jewel),
    conqueror: c.conqueror,
    seed: String(c.seed),
    location: String(c.socket),
  });
  if (c.jewel === 11) {
    params.set("class", String(c.classStartIndex ?? 0));
    if (c.ascendancyName) params.set("asc", c.ascendancyName);
  }
  return `${siteBase()}tree?${params.toString()}`;
}

function renderNode(node: SmokeNode): string[] {
  const flags: string[] = [node.kind];
  if (node.attributeSmall) flags.push("attribute-small");
  if (node.stub) flags.push("STUB passive_skills");
  const lines: string[] = [];
  lines.push(
    `- **${node.nameRu}** (EN: ${node.nameEn}) · skill \`${node.skill}\` · _${flags.join(", ")}_ · источник: ${node.source}`,
  );
  if (node.replace.length > 0) {
    lines.push(`  - replace (APS keys: ${node.replaceKeys.join(", ") || "—"}):`);
    node.replace.forEach((l) => lines.push(`    - ${l}`));
  }
  for (let i = 0; i < node.additions.length; i++) {
    const keyInfo = node.additionKeys[i]?.join(", ") || "—";
    lines.push(`  - addition (APA keys: ${keyInfo}): ${node.additions[i]}`);
  }
  if (node.replace.length === 0 && node.additions.length === 0) {
    lines.push(`  - _(нет форматируемых строк; keys: ${node.replaceKeys.join(", ")})_`);
  }
  return lines;
}

/** Полный Markdown-отчёт по снапшоту. */
export function renderReport(snapshot: SmokeSnapshot): string {
  const out: string[] = [];
  const now = new Date().toISOString();
  const totalNodes = snapshot.cases.reduce((n, c) => n + c.nodes.length, 0);

  out.push(`# Smoke-отчёт данных (§2)`);
  out.push("");
  out.push(`- Сгенерировано: \`${now}\``);
  out.push(`- caseSeed: \`${snapshot.caseSeed}\``);
  out.push(`- Кейсов: **${snapshot.cases.length}**, нод: **${totalNodes}**`);
  out.push(
    `- Строки эффекта — через продовый форматтер \`translateStatRecord\` (тот же dict-пайплайн, что и тултип).`,
  );
  out.push("");

  // Сводка по самоцветам.
  out.push(`## Сводка по самоцветам`);
  out.push("");
  out.push(`| jewel | RU | кейсов | нод |`);
  out.push(`| --- | --- | --- | --- |`);
  for (let jewel = 1; jewel <= 11; jewel++) {
    const cs = snapshot.cases.filter((c) => c.jewel === jewel);
    if (cs.length === 0) continue;
    const nodes = cs.reduce((n, c) => n + c.nodes.length, 0);
    out.push(
      `| ${jewel} | ${cs[0]!.jewelRu} | ${cs.length} | ${nodes} |`,
    );
  }
  out.push("");

  // §2.3: ручная сверка.
  const checklist = snapshot.cases
    .filter((c) => c.nodes.length > 0)
    .slice(0, 8);
  if (checklist.length > 0) {
    out.push(`## Ручная сверка (§2.3)`);
    out.push("");
    out.push(
      `Открыть ссылку → открыть PoB / другой калькулятор с теми же jewel/seed/socket → сравнить текст ноды.`,
    );
    out.push("");
    checklist.forEach((c) => {
      out.push(
        `- [ ] ${c.jewelRu} / ${c.conquerorRu} / seed \`${c.seed}\` / сокет \`${c.socketName}\` → ${caseUrl(c)}`,
      );
    });
    out.push("");
  }

  // Кейсы.
  out.push(`## Кейсы`);
  out.push("");
  for (const c of snapshot.cases) {
    const zorath =
      c.jewel === 11 ? `, class=\`${c.classStartIndex ?? 0}\`` : "";
    out.push(
      `### ${c.id}`,
    );
    out.push(
      `${c.jewelRu} (${c.jewelEn}) / **${c.conquerorRu}** (${c.conqueror}) · seed=\`${c.seed}\` · сокет \`${c.socketName}\` (${c.socket})${zorath} · затронуто нод: ${c.totalAffected} (показано ${c.nodes.length})`,
    );
    out.push("");
    out.push(`URL: ${caseUrl(c)}`);
    out.push("");
    if (c.nodes.length === 0) {
      out.push(`_Нет затронутых нод с результатом._`);
      out.push("");
      continue;
    }
    c.nodes.forEach((n) => {
      renderNode(n).forEach((l) => out.push(l));
    });
    out.push("");
  }

  return out.join("\n");
}

/** Краткий Markdown-diff для лога/артефакта при расхождении с baseline. */
export function renderDiff(diff: DiffResult): string {
  const out: string[] = ["# Smoke baseline diff", ""];
  if (diff.identical) {
    out.push("Расхождений нет.");
    return out.join("\n");
  }
  out.push(`- новых кейсов: ${diff.added.length}`);
  out.push(`- пропавших кейсов: ${diff.removed.length}`);
  out.push(`- изменившихся кейсов: ${diff.changed.length}`);
  out.push("");
  const block = (title: string, ids: string[]) => {
    if (ids.length === 0) return;
    out.push(`## ${title}`);
    ids.forEach((id) => out.push(`- ${id}`));
    out.push("");
  };
  block("Новые", diff.added);
  block("Пропавшие", diff.removed);
  block("Изменившиеся", diff.changed);
  return out.join("\n");
}
