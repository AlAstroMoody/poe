/**
 * §2.2: строки эффекта для отчёта — «как в тултипе».
 *
 * Переиспользует продовый форматтер `translateStatRecord` из `@/lib/skill_tree`
 * (тот же dict-пайплайн, что и тултип/список сидов), а не пишет свой.
 * Из результата `Calculate` берём StatsKeys[i] ↔ StatRolls[i] и собираем
 * Record<statId, roll>, который форматтер умеет склеивать (min/max и т.п.).
 */
import { translateStatRecord } from "@/lib/skill_tree";
import { stripStatDescriptionMarkup } from "@/lib/dict";

/** Структурный тип результата `Calculate` (совпадает с wasmDataService.WasmCalculator). */
export type CalcResult = {
  AlternatePassiveSkill?: {
    Index?: number;
    ID?: string;
    Name?: string;
    StatsKeys?: number[];
  };
  StatRolls?: Record<number, number>;
  AlternatePassiveAdditionInformations?: Array<{
    AlternatePassiveAddition?: { StatsKeys?: number[] };
    StatRolls?: Record<number, number>;
  }>;
};

/** Позиционные роллы WASM (`StatRolls[i]`) → Record<statId, roll>. */
export function statKeysToRecord(
  keys: number[] | undefined,
  rolls: Record<number, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  (keys ?? []).forEach((statId, i) => {
    const roll = rolls?.[i];
    if (typeof roll === "number") out[String(statId)] = roll;
  });
  return out;
}

function cleanLines(lines: string[]): string[] {
  return lines
    .map((l) => stripStatDescriptionMarkup(l).trim())
    .filter((l) => l.length > 0);
}

export type FormattedResult = {
  /** Строки замены (AlternatePassiveSkill). */
  replace: string[];
  /** Строки дополнений (AlternatePassiveAdditionInformations). */
  additions: string[];
  /** Сырые StatKeys — для отладки/сверки. */
  replaceKeys: number[];
  additionKeys: number[][];
};

/** Строки эффекта для одного результата `Calculate` на заданном языке. */
export function formatResultLines(
  result: CalcResult | undefined,
  lang: "ru" | "en",
): FormattedResult {
  const replaceKeys = result?.AlternatePassiveSkill?.StatsKeys ?? [];
  const replaceRecord = statKeysToRecord(replaceKeys, result?.StatRolls);
  const replace = cleanLines(translateStatRecord(replaceRecord, lang));

  const additionKeys: number[][] = [];
  const additions: string[] = [];
  for (const info of result?.AlternatePassiveAdditionInformations ?? []) {
    const keys = info.AlternatePassiveAddition?.StatsKeys ?? [];
    additionKeys.push(keys);
    const rec = statKeysToRecord(keys, info.StatRolls);
    additions.push(...cleanLines(translateStatRecord(rec, lang)));
  }

  return { replace, additions, replaceKeys, additionKeys };
}
