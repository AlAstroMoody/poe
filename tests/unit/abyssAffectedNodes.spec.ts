import { describe, expect, it } from "vitest";
import {
  isAbyssEyeJewel,
  isAbyssSpecialJewel,
  isAbyssTimelessJewel,
  normalizeAlternatePassiveSkill,
  usesNonCircularAbyssArea,
} from "@/lib/abyssAffectedNodes";

describe("классификация abyss-самоцветов", () => {
  it("глаза = 7..10, Zorath = 11", () => {
    expect([6, 7, 8, 9, 10, 11].map(isAbyssEyeJewel)).toEqual([
      false, true, true, true, true, false,
    ]);
    expect(isAbyssSpecialJewel(11)).toBe(true);
    expect(isAbyssSpecialJewel(10)).toBe(false);
  });

  it("некруглая область = глаза ∪ Zorath (7..11), таймлес-правила совпадают", () => {
    expect([6, 7, 10, 11, 12].map(usesNonCircularAbyssArea)).toEqual([
      false, true, true, true, false,
    ]);
    for (const t of [7, 8, 9, 10, 11]) {
      expect(isAbyssTimelessJewel(t)).toBe(true);
    }
    expect(isAbyssTimelessJewel(6)).toBe(false);
  });
});

describe("normalizeAlternatePassiveSkill", () => {
  it("поддерживает Id (строка) как синоним ID", () => {
    const r = normalizeAlternatePassiveSkill({ Id: "foo", Name: "Foo" });
    expect(r?.ID).toBe("foo");
    expect(r?.Name).toBe("Foo");
  });

  it("распаковывает array-like StatsKeys ({0:n, length})", () => {
    const r = normalizeAlternatePassiveSkill({ ID: "x", StatsKeys: { 0: 5, length: 1 } });
    expect(r?.StatsKeys).toEqual([5]);
  });

  it("приводит числа в массиве StatsKeys", () => {
    const r = normalizeAlternatePassiveSkill({ ID: "x", StatsKeys: [1, "2", 3] });
    expect(r?.StatsKeys).toEqual([1, 2, 3]);
  });

  it("применяет fallback для Zorath ascendancy-notable по key", () => {
    const r = normalizeAlternatePassiveSkill(undefined, 186);
    expect(r).toEqual({
      ID: "abyss_special_ascendancy_notable_1",
      Name: "Sanguine Bargain",
      StatsKeys: [23253],
    });
  });

  it("undefined, если нет ни данных, ни fallback", () => {
    expect(normalizeAlternatePassiveSkill({})).toBeUndefined();
    expect(normalizeAlternatePassiveSkill(null)).toBeUndefined();
  });
});
