#!/usr/bin/env node
/**
 * Из JSON PyPoE (`pypoe_exporter dat json … --language Russian`, блок AlternatePassiveSkills.dat)
 * делает Id → русское Name и пишет src/temp/ru/alternate_passive_names_from_dat_ru.json для build:dict.
 *
 * Использование:
 *   node scripts/extract-alternate-passive-names-ru-from-pypoe-bundle.mjs /path/to/bundle.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = join(ROOT, "src", "temp", "ru", "alternate_passive_names_from_dat_ru.json");

function blockToRows(block) {
  if (!block.header?.length || !Array.isArray(block.data)) {
    throw new Error("Invalid block: need header and data arrays");
  }
  const sorted = [...block.header].sort((a, b) => a.rowid - b.rowid);
  const names = sorted.map((h) => h.name);
  return block.data.map((row, rowIndex) => {
    const obj = {};
    for (let i = 0; i < names.length; i++) {
      obj[names[i]] = row[i];
    }
    if (obj._key === undefined && obj.Key !== undefined) obj._key = obj.Key;
    if (obj._key === undefined) obj._key = rowIndex;
    return obj;
  });
}

function main() {
  const bundlePath = process.argv[2];
  if (!bundlePath || !existsSync(bundlePath)) {
    console.error("Usage: node scripts/extract-alternate-passive-names-ru-from-pypoe-bundle.mjs <bundle.json>");
    process.exit(1);
  }

  const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  if (!Array.isArray(bundle)) {
    console.error("Bundle must be a JSON array");
    process.exit(1);
  }

  const block = bundle.find((b) => b.filename === "AlternatePassiveSkills.dat");
  if (!block) {
    console.error('В бандле нет блока "AlternatePassiveSkills.dat"');
    process.exit(1);
  }

  const rows = blockToRows(block);
  const byId = {};
  for (const row of rows) {
    const id = row.Id != null ? String(row.Id) : "";
    const name = row.Name != null ? String(row.Name).trim() : "";
    if (id && name) byId[id] = name;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(byId, null, 2), "utf8");
  console.log("Wrote", Object.keys(byId).length, "entries ->", OUT_PATH);
}

main();
