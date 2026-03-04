#!/usr/bin/env node
/**
 * Собирает русские названия альтернативных пассивов с PoEDB (poedb.tw/ru).
 * Список нод берётся из data/alternate_passive_skills.json (Id + Name).
 * Результат: src/temp/ru/alternate_passive_names_poedb_ru.json
 * Запуск из корня frontend-vue: node scripts/fetch-alternate-passive-names-ru.mjs (или npm run fetch:alternate-names).
 * Нужен Node 18+ (fetch).
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, "data");
const OUT_PATH = join(ROOT, "src", "temp", "ru", "alternate_passive_names_poedb_ru.json");

const POEDB_BASE = "https://poedb.tw/ru";
const DELAY_MS = 800;

/** Slug для URL PoEDB: пробелы → _, апостроф оставляем */
function nameToSlug(name) {
  return name.replace(/\s+/g, "_").trim();
}

/** Достать русское название из HTML PoEDB */
function parseRussianName(html) {
  const re =
    /<div class="itemName typeLine">\s*<span class="lc">([^<]+)<\/span>\s*<\/div>/i;
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PoE tool)" },
        redirect: "follow",
      });
      if (!res.ok) return null;
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

async function main() {
  const skillsPath = join(DATA_DIR, "alternate_passive_skills.json");
  if (!existsSync(skillsPath)) {
    console.error("Not found:", skillsPath, "(положите сюда JSON из родительского data/ или go-pob-data)");
    process.exit(1);
  }

  const skills = JSON.parse(readFileSync(skillsPath, "utf8"));
  const byId = {};
  const seen = new Set();

  for (const row of skills) {
    const id = row.Id;
    const name = row.Name;
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);

    const slug = nameToSlug(name);
    const url = `${POEDB_BASE}/${encodeURIComponent(slug).replace(/%2F/g, "/")}`;

    process.stdout.write(`${id} (${name}) -> ${url} ... `);
    try {
      const html = await fetchWithRetry(url);
      const ru = html ? parseRussianName(html) : null;
      if (ru) {
        byId[id] = ru;
        console.log(ru);
      } else {
        console.log("(no ru name)");
      }
    } catch (e) {
      console.log("error:", e.message);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const outDir = dirname(OUT_PATH);
  if (!existsSync(outDir)) {
    console.error("Create dir first:", outDir);
    process.exit(1);
  }
  writeFileSync(OUT_PATH, JSON.stringify(byId, null, 2), "utf8");
  console.log("\nWrote", OUT_PATH, "entries:", Object.keys(byId).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
