import { describe, expect, it } from "vitest";
import {
  CLASS_START_SKILL,
  classStartSkillId,
  shortestPathToClassStart,
} from "@/lib/zorathPath";
import type { Node } from "@/lib/skill_tree_types";

const SCION = CLASS_START_SKILL[0]!; // 58833

describe("classStartSkillId", () => {
  it("возвращает id старта класса по индексу", () => {
    expect(classStartSkillId(0)).toBe(SCION);
    expect(classStartSkillId(6)).toBe(CLASS_START_SKILL[6]);
  });

  it("undefined для неизвестного индекса", () => {
    expect(classStartSkillId(99)).toBeUndefined();
  });
});

describe("shortestPathToClassStart", () => {
  it("находит путь сокет → старт класса включительно", () => {
    const nodes: Record<string, Node> = {
      "100": { out: ["101"] },
      "101": { out: [String(SCION)] },
      [String(SCION)]: { classStartIndex: 0 },
    };
    expect(shortestPathToClassStart(nodes, 100, 0)).toEqual([100, 101, SCION]);
  });

  it("если сокет сам является стартом — путь из одного узла", () => {
    const nodes: Record<string, Node> = { [String(SCION)]: {} };
    expect(shortestPathToClassStart(nodes, SCION, 0)).toEqual([SCION]);
  });

  it("возвращает [] при недостижимости", () => {
    const nodes: Record<string, Node> = {
      "100": { out: ["101"] },
      "101": {},
    };
    expect(shortestPathToClassStart(nodes, 100, 0)).toEqual([]);
  });

  it("обходит ascendancy-ноды по альтернативному пути", () => {
    const nodes: Record<string, Node> = {
      "100": { out: ["200", "300"] },
      "200": { ascendancyName: "Ascendant", out: [String(SCION)] },
      "300": { out: [String(SCION)] },
      [String(SCION)]: {},
    };
    expect(shortestPathToClassStart(nodes, 100, 0)).toEqual([100, 300, SCION]);
  });

  it("обходит proxy-ноды", () => {
    const nodes: Record<string, Node> = {
      "100": { out: ["200", "300"] },
      "200": { isProxy: true, out: [String(SCION)] },
      "300": { out: [String(SCION)] },
      [String(SCION)]: {},
    };
    expect(shortestPathToClassStart(nodes, 100, 0)).toEqual([100, 300, SCION]);
  });

  it("находит короткий путь в графе (edges читаются как out+in, неориентированно)", () => {
    const nodes: Record<string, Node> = {
      "1": { out: ["2"] },
      "2": { out: ["3", "4"] },
      "3": { out: [String(SCION)] },
      "4": {},
      [String(SCION)]: {},
    };
    const path = shortestPathToClassStart(nodes, 1, 0);
    expect(path).toEqual([1, 2, 3, SCION]);
  });
});
