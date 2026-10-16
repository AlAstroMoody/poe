/**
 * §2: регрессионный смоук-тест данных.
 *
 * Прогоняет воспроизводимую выборку кейсов через настоящий расчёт (WASM + abyss LUT),
 * пишет человекочитаемый отчёт в `artifacts/smoke-report.md` и сверяет с
 * закоммиченным baseline (`tests/smoke/baseline/smoke-baseline.json`).
 *
 * Baseline — компактный (без отображаемых имён и pretty-print) и выборочный
 * (ограниченное число нод на кейс), см. `toBaselineSnapshot` в `report.ts`.
 *
 * Запуск:
 *   npm run test:smoke-data            — прогнать (fail при расхождении с baseline)
 *   npm run test:smoke-data:update     — перезаписать baseline текущим состоянием
 *   SMOKE_CASE_SEED=42 npm run test:smoke-data   — другая выборка
 *   SMOKE_MAX_NODES=8 npm run test:smoke-data:update  — компактнее baseline
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSmoke } from "./run";
import {
  diffBaselineSnapshots,
  renderDiff,
  toBaselineSnapshot,
  type BaselineSnapshot,
} from "./report";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ARTIFACTS_DIR = path.join(REPO_ROOT, "artifacts");
const REPORT_PATH = path.join(ARTIFACTS_DIR, "smoke-report.md");
const DIFF_PATH = path.join(ARTIFACTS_DIR, "smoke-report.diff.md");
const BASELINE_PATH = fileURLToPath(
  new URL("./baseline/smoke-baseline.json", import.meta.url),
);

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function readBaseline(): Promise<BaselineSnapshot | null> {
  try {
    return JSON.parse(
      await readFile(BASELINE_PATH, "utf8"),
    ) as BaselineSnapshot;
  } catch {
    return null;
  }
}

describe("smoke данных (§2)", () => {
  it("генерирует отчёт и сверяется с baseline", async () => {
    const update = process.env.UPDATE_BASELINE === "1";
    const caseSeed = envInt("SMOKE_CASE_SEED") ?? 1;
    const maxCases = envInt("SMOKE_MAX_CASES");
    const maxNodesPerCase = envInt("SMOKE_MAX_NODES");

    const { snapshot, markdown } = await runSmoke({
      caseSeed,
      maxCases,
      maxNodesPerCase,
    });

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await writeFile(REPORT_PATH, markdown, "utf8");

    expect(
      snapshot.cases.length,
      "выборка пуста — проверьте prepare:wasm-data / public/data",
    ).toBeGreaterThan(0);

    // Компактный baseline: только регрессионный сигнал, без имён (меняются между версиями).
    const compact = toBaselineSnapshot(snapshot);

    if (update) {
      const body = JSON.stringify(compact);
      await mkdir(path.dirname(BASELINE_PATH), { recursive: true });
      await writeFile(BASELINE_PATH, body + "\n", "utf8");
      console.log(
        `[smoke] baseline обновлён: ${BASELINE_PATH} (${Buffer.byteLength(body)} байт)`,
      );
      return;
    }

    const baseline = await readBaseline();
    if (!baseline) {
      console.warn(
        `[smoke] baseline не найден (${BASELINE_PATH}) — сравнение пропущено. ` +
          `Отчёт: ${REPORT_PATH}. Создать baseline: npm run test:smoke-data:update`,
      );
      return;
    }

    const diff = diffBaselineSnapshots(baseline, compact);
    if (!diff.identical) {
      await writeFile(DIFF_PATH, renderDiff(diff), "utf8");
    }
    expect(
      diff.identical,
      `данные разошлись с baseline: +${diff.added.length} / -${diff.removed.length} / ~${diff.changed.length}. ` +
        `Diff: ${DIFF_PATH}; отчёт: ${REPORT_PATH}. Если расхождение ожидаемо (патч) — npm run test:smoke-data:update`,
    ).toBe(true);
  });
});
