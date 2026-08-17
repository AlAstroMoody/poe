/** Zorath (jewel 11): shortest path from jewel socket to class start. */

import type { Node } from "./skill_tree_types";

/** PassiveSkillGraphId of each class start (classStartIndex → skill). */
export const CLASS_START_SKILL: Record<number, number> = {
  0: 58833, // Scion
  1: 47175, // Marauder
  2: 50459, // Ranger
  3: 54447, // Witch
  4: 50986, // Duelist
  5: 61525, // Templar
  6: 44683, // Shadow
};

/** Ascendancies with empty Zorath ASCS picks (incompatible). */
export const ZORATH_EMPTY_ASCENDANCIES = new Set([
  "Ascendant",
  "Reliquarian",
]);

export function classStartSkillId(classStartIndex: number): number | undefined {
  return CLASS_START_SKILL[classStartIndex];
}

function nodeBySkill(
  nodes: Record<string, Node>,
  skillId: number,
): Node | undefined {
  return nodes[String(skillId)] ?? nodes[skillId as unknown as string];
}

function neighbors(nodes: Record<string, Node>, skillId: number): number[] {
  const n = nodeBySkill(nodes, skillId);
  if (!n) return [];
  const out: number[] = [];
  for (const x of [...(n.out ?? []), ...(n.in ?? [])]) {
    out.push(Number(x));
  }
  return out;
}

/**
 * Undirected BFS on the main tree (skip ascendancy / proxy nodes).
 * Returns skill ids from socket to class start inclusive, or [] if unreachable.
 */
export function shortestPathToClassStart(
  nodes: Record<string, Node>,
  socketSkillId: number,
  classStartIndex: number,
): number[] {
  const goal = classStartSkillId(classStartIndex);
  if (goal == null) return [];
  if (socketSkillId === goal) return [socketSkillId];

  const prev = new Map<number, number | null>();
  prev.set(socketSkillId, null);
  const queue: number[] = [socketSkillId];

  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi]!;
    if (u === goal) break;
    for (const v of neighbors(nodes, u)) {
      if (prev.has(v)) continue;
      const vn = nodeBySkill(nodes, v);
      if (!vn) continue;
      if (vn.isProxy) continue;
      if (vn.ascendancyName) continue;
      if (vn.expansionJewel?.parent) continue;
      prev.set(v, u);
      queue.push(v);
    }
  }

  if (!prev.has(goal)) return [];
  const path: number[] = [];
  let cur: number | null = goal;
  while (cur != null) {
    path.push(cur);
    cur = prev.get(cur) ?? null;
  }
  path.reverse();
  return path;
}
