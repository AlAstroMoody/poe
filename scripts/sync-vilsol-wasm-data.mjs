#!/usr/bin/env node
/**
 * Скачивает в data/ те же gzip-дампы, что встроены в upstream
 * https://github.com/Vilsol/timeless-jewels (как на vilsol.github.io/timeless-jewels).
 *
 * Локальные переводы stat_descriptions_ru*.gz не трогаем (в апстриме нет).
 *
 * После: npm run prepare:wasm-data && npm run wasm:build
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'data');

const BASE =
  'https://raw.githubusercontent.com/Vilsol/timeless-jewels/master/data/';

/** Файлы расчёта + англ. описаний статов (как в data/main.go go:embed). RU — отдельно в проекте. */
const FILES = [
  'alternate_passive_additions.json.gz',
  'alternate_passive_skills.json.gz',
  'alternate_tree_versions.json.gz',
  'passive_skills.json.gz',
  'stats.json.gz',
  'possible_stats.json.gz',
  'stat_descriptions.json.gz',
  'passive_skill_stat_descriptions.json.gz',
  'passive_skill_aura_stat_descriptions.json.gz',
];

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (
        res.statusCode === 301 ||
        res.statusCode === 302 ||
        res.statusCode === 307
      ) {
        const loc = res.headers.location;
        if (!loc) {
          reject(new Error(`Redirect without Location: ${url}`));
          return;
        }
        const next = loc.startsWith('http') ? loc : new URL(loc, url).href;
        download(next).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  for (const name of FILES) {
    const url = BASE + name;
    const dest = join(OUT, name);
    process.stdout.write(`Fetching ${name}... `);
    const buf = await download(url);
    writeFileSync(dest, buf);
    console.log(`${buf.length} bytes`);
  }
  console.log('\nDone. Next: npm run prepare:wasm-data && npm run wasm:build');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
