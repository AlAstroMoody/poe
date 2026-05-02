#!/usr/bin/env node
/**
 * Склеивает несколько выходов `pypoe_exporter dat json` (каждый — JSON-массив блоков)
 * в один bundle для `import:pypoe-dat-bundle.mjs`.
 *
 *   node scripts/merge-pypoe-dat-json-bundles.mjs <out.json> <part1.json> [part2.json ...]
 */

import { readFileSync, writeFileSync } from "fs";

const [, , outPath, ...partPaths] = process.argv;
if (!outPath || partPaths.length === 0) {
  console.error("Usage: node scripts/merge-pypoe-dat-json-bundles.mjs <out.json> <part1.json> ...");
  process.exit(1);
}

const merged = [];
for (const p of partPaths) {
  const raw = readFileSync(p, "utf8");
  const a = JSON.parse(raw);
  if (!Array.isArray(a)) {
    console.error("Not a JSON array:", p);
    process.exit(1);
  }
  merged.push(...a);
}

writeFileSync(outPath, JSON.stringify(merged), "utf8");
console.log("Merged", partPaths.length, "parts,", merged.length, "blocks ->", outPath);
