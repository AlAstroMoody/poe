#!/usr/bin/env node
/**
 * Собирает id -> sd[] из src/temp/en/pob-legion/LegionPassives.json (данные PoB)
 * в src/lib/alternatePassiveDisplayEnById.json для тултипов, когда нет шаблона в stat_descriptions.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src/temp/en/pob-legion/LegionPassives.json');
const OUT = join(ROOT, 'src/lib/alternatePassiveDisplayEnById.json');

const d = JSON.parse(readFileSync(SRC, 'utf8'));
const out = {};
for (const key of ['nodes', 'additions']) {
  for (const n of d[key] || []) {
    const id = n.id;
    const sd = n.sd;
    if (id && Array.isArray(sd) && sd.length) out[id] = sd;
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 0) + '\n', 'utf8');
console.log(`Wrote ${Object.keys(out).length} ids -> ${OUT}`);
