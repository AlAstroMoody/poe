import { getData, getCalculator } from "@/services/wasmDataService";
import type { WasmCalculator } from "@/services/wasmDataService";

/**
 * Строка из passive_skills (WASM): в Calculate уходит `_key` как passiveID,
 * потому что в Go это GetPassiveSkillByIndex(passiveID) → idToPassiveSkill[index].
 * Сид RNG при этом берётся из PassiveSkillGraphID этой же строки, не из Index
 * (см. random.NumberGenerator.Reset в репозитории).
 */
export type PassiveSkillRow = {
  Index: number;
  /** Id из PassiveSkills.dat; заглушки prepare-wasm-data: skilltree_stub_<graphId> */
  Id?: string;
  PassiveSkillGraphID?: number;
  Name?: string;
  IsNotable?: boolean;
  IsKeystone?: boolean;
};

/** Заглушка без полной строки в экспорте PoB — расчёт альтернативы может не совпадать с игрой. */
export function isPassiveSkillStub(row: PassiveSkillRow | undefined): boolean {
  const id = row?.Id ?? "";
  return id.startsWith("skilltree_stub_");
}

/**
 * Поле `skill` у ноды в JSON дерева = PassiveSkillGraphId из игры.
 * По нему находим строку в дампе и вызываем Calculate(passive_skills._key, …).
 */
export function getPassiveRowByTreeSkill(
  passiveSkillGraphId: number,
): PassiveSkillRow | undefined {
  const row = getData().TreeToPassive[passiveSkillGraphId] as
    | PassiveSkillRow
    | undefined;
  if (!row) return undefined;
  if (
    row.PassiveSkillGraphID != null &&
    row.PassiveSkillGraphID !== passiveSkillGraphId
  ) {
    console.warn(
      "[timelessJewel] TreeToPassive PassiveSkillGraphID !== tree skill",
      { passiveSkillGraphId, row },
    );
  }
  return row;
}

export function calculateTimelessForTreeSkill(
  passiveSkillGraphId: number,
  seed: number,
  jewelType: number,
  conqueror: string,
): ReturnType<WasmCalculator["Calculate"]> {
  const row = getPassiveRowByTreeSkill(passiveSkillGraphId);
  if (!row) return undefined;
  return getCalculator().Calculate(
    row.Index,
    seed,
    jewelType,
    conqueror,
  ) as ReturnType<WasmCalculator["Calculate"]>;
}

export function alternateLookupTraceForTreeSkill(
  passiveSkillGraphId: number,
  seed: number,
  jewelType: number,
  conqueror: string,
): ReturnType<WasmCalculator["AlternateLookupTrace"]> | null {
  const row = getPassiveRowByTreeSkill(passiveSkillGraphId);
  if (!row) return null;
  return getCalculator().AlternateLookupTrace(
    row.Index,
    seed,
    jewelType,
    conqueror,
  );
}
