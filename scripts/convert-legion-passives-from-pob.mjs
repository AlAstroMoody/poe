#!/usr/bin/env node
/**
 * Скачивает LegionPassives.json (repoe-fork pob-data), мержит с локальным baseline
 * alternate_passive_skills / alternate_passive_additions и пишет .json.gz в poe/data.
 *
 * Источник: https://repoe-fork.github.io/pob-data/poe1/TimelessJewelData/LegionPassives.json
 *
 * Нужен stats.json.gz (Id → _key) в poe/data — той же «пачки», что и baseline.
 * Режим: по умолчанию baseline сохраняет все числовые поля WASM; из PoB подставляются
 * Name / DDSIcon / строки отображения. Записи только в PoB без baseline синтезируются
 * (нужны все stat id в stats.json).
 *
 * Usage:
 *   node scripts/convert-legion-passives-from-pob.mjs
 *   node scripts/convert-legion-passives-from-pob.mjs --url <url>
 *   node scripts/convert-legion-passives-from-pob.mjs --strict
 *
 * По умолчанию записи PoB, у которых stat id нет в stats.json.gz, пропускаются (warning).
 * --strict — завершить с ошибкой при первом неизвестном stat id.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { gunzipSync, gzipSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = join(ROOT, 'data');
const TEMP = join(ROOT, 'src', 'temp', 'en', 'pob-legion');

const DEFAULT_URL =
  'https://repoe-fork.github.io/pob-data/poe1/TimelessJewelData/LegionPassives.json';

function alternateTreeVersionKeyFromId(id) {
  if (!id || typeof id !== 'string') return null;
  if (id.startsWith('vaal_')) return 1;
  if (id.startsWith('karui_')) return 2;
  if (id.startsWith('maraketh_')) return 3;
  if (id.startsWith('templar_')) return 4;
  if (id.startsWith('eternal_')) return 5;
  if (id.startsWith('kalguur_') || id.startsWith('kalguuran_')) return 6;
  return null;
}

/** Как в alternate_passive_additions.json из dat */
function passiveTypeFromAdditionId(id) {
  if (id.includes('attribute_')) return [1];
  if (id.includes('notable_') || id.includes('_notable_')) return [3];
  if (id.startsWith('vaal_')) return [3];
  return [2];
}

function passiveTypeFromPobNode(node) {
  if (node.ks) return [4];
  if (node.not) return [3];
  return [1, 2];
}

function pobStatToUintRange(st) {
  if (!st || typeof st.min !== 'number' || typeof st.max !== 'number') {
    return [0, 0];
  }
  let mn = st.min;
  let mx = st.max;
  const isFrac = mn !== Math.trunc(mn) || mx !== Math.trunc(mx);
  if (st.fmt === 'g' && isFrac) {
    mn = Math.round(mn * 100);
    mx = Math.round(mx * 100);
  } else {
    mn = Math.round(mn);
    mx = Math.round(mx);
  }
  return [Math.max(0, mn) >>> 0, Math.max(0, mx) >>> 0];
}

function loadStatsById() {
  const path = join(DATA, 'stats.json.gz');
  if (!existsSync(path)) {
    throw new Error(`Нет ${path} — положи stats.json.gz рядом с alternate_*.json.gz`);
  }
  const raw = gunzipSync(readFileSync(path)).toString('utf8');
  const rows = JSON.parse(raw);
  const byId = Object.create(null);
  for (const row of rows) {
    if (row.Id != null) byId[row.Id] = row._key;
  }
  return byId;
}

function loadJsonGz(path) {
  if (!existsSync(path)) return null;
  const raw = gunzipSync(readFileSync(path)).toString('utf8');
  return JSON.parse(raw);
}

function writeJsonGz(obj, outPath) {
  const buf = gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'), { level: 9 });
  writeFileSync(outPath, buf);
}

function statsKeysFromPob(sortedStats, statsById, label, skipMissing) {
  const keys = [];
  for (const sid of sortedStats) {
    const k = statsById[sid];
    if (k === undefined) {
      if (skipMissing) {
        return null;
      }
      throw new Error(`[${label}] неизвестный stat id "${sid}" — обнови stats.json.gz`);
    }
    keys.push(k);
  }
  return keys;
}

function synthesizeAdditionFromPob(add, statsById, nextKey, skipMissing) {
  const id = add.id;
  const treeKey = alternateTreeVersionKeyFromId(id);
  if (treeKey == null) {
    if (skipMissing) return null;
    throw new Error(`addition ${id}: неизвестный префикс для AlternateTreeVersionsKey`);
  }
  const sorted = add.sortedStats || [];
  const statsKeys = statsKeysFromPob(sorted, statsById, `addition:${id}`, skipMissing);
  if (statsKeys == null) return null;
  const [s1a, s1b] =
    sorted.length >= 1 ? pobStatToUintRange(add.stats?.[sorted[0]]) : [0, 0];
  const [s2a, s2b] =
    sorted.length >= 2 ? pobStatToUintRange(add.stats?.[sorted[1]]) : [0, 0];

  return {
    _key: nextKey,
    Id: id,
    AlternateTreeVersionsKey: treeKey,
    SpawnWeight: 100,
    StatsKeys: statsKeys,
    Stat1Min: s1a,
    Stat1Max: s1b,
    Var6: s2a,
    Var7: s2b,
    Var8: 0,
    Var9: 0,
    PassiveType: passiveTypeFromAdditionId(id),
    Var11: 0,
  };
}

function synthesizeSkillFromPob(node, statsById, nextKey, skipMissing) {
  const id = node.id;
  const treeKey = alternateTreeVersionKeyFromId(id);
  if (treeKey == null) {
    if (skipMissing) return null;
    throw new Error(`node ${id}: неизвестный префикс для AlternateTreeVersionsKey`);
  }
  const sorted = node.sortedStats || [];
  const statsKeys = statsKeysFromPob(sorted, statsById, `node:${id}`, skipMissing);
  if (statsKeys == null) return null;
  const ranges = [];
  for (let i = 0; i < Math.min(sorted.length, 4); i++) {
    ranges.push(pobStatToUintRange(node.stats?.[sorted[i]]));
  }
  while (ranges.length < 4) ranges.push([0, 0]);

  return {
    _key: nextKey,
    Id: id,
    AlternateTreeVersionsKey: treeKey,
    Name: node.dn || id,
    PassiveType: passiveTypeFromPobNode(node),
    StatsKeys: statsKeys,
    Stat1Min: ranges[0][0],
    Stat1Max: ranges[0][1],
    Stat2Min: ranges[1][0],
    Stat2Max: ranges[1][1],
    Var9: ranges[2][0],
    Var10: ranges[2][1],
    Var11: ranges[3][0],
    Var12: ranges[3][1],
    Var13: 0,
    Var14: 0,
    Var15: 0,
    Var16: 0,
    SpawnWeight: 100,
    Var18: 0,
    RandomMin: 0,
    RandomMax: 0,
    FlavourText: '',
    DDSIcon: node.icon || '',
    AchievementItemsKeys: [],
    Var24: 0,
    Var25: 100,
  };
}

function mergeSkillRow(baselineRow, pobNode) {
  const o = { ...baselineRow };
  if (pobNode?.dn) o.Name = pobNode.dn;
  if (pobNode?.icon) o.DDSIcon = pobNode.icon;
  return o;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'timeless-jewels-poe/convert-legion-passives',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function main() {
  const argv = process.argv.slice(2);
  let url = DEFAULT_URL;
  let skipMissing = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      url = argv[++i];
    }
    if (argv[i] === '--strict') {
      skipMissing = false;
    }
  }

  mkdirSync(TEMP, { recursive: true });

  console.log(`Fetching ${url} ...`);
  const legion = await fetchJson(url);
  const rawPath = join(TEMP, 'LegionPassives.json');
  writeFileSync(rawPath, JSON.stringify(legion), 'utf8');
  console.log(`Saved raw copy → ${rawPath}`);

  const statsById = loadStatsById();
  const versions = loadJsonGz(join(DATA, 'alternate_tree_versions.json.gz'));
  const maxVersionKey = versions
    ? Math.max(...versions.map((v) => v._key))
    : 5;
  if (maxVersionKey < 6) {
    console.warn(
      'В alternate_tree_versions нет ключа 6 (Kalguur): записи kalguur_* могут быть бесполезны для WASM, пока не добавишь строку в alternate_tree_versions.json.gz',
    );
  }

  const baselineSkills = loadJsonGz(join(DATA, 'alternate_passive_skills.json.gz')) || [];
  const baselineAdds = loadJsonGz(join(DATA, 'alternate_passive_additions.json.gz')) || [];

  const skillsById = Object.create(null);
  for (const row of baselineSkills) {
    skillsById[row.Id] = row;
  }
  const addsById = Object.create(null);
  for (const row of baselineAdds) {
    addsById[row.Id] = row;
  }

  const pobNodes = Array.isArray(legion.nodes) ? legion.nodes : [];
  const pobAdds = Array.isArray(legion.additions) ? legion.additions : [];
  const pobNodeById = Object.create(null);
  for (const n of pobNodes) {
    if (n?.id) pobNodeById[n.id] = n;
  }
  const pobAddById = Object.create(null);
  for (const a of pobAdds) {
    if (a?.id) pobAddById[a.id] = a;
  }

  let maxSkillKey = baselineSkills.length
    ? Math.max(...baselineSkills.map((r) => r._key))
    : -1;
  let maxAddKey = baselineAdds.length ? Math.max(...baselineAdds.map((r) => r._key)) : -1;

  const outSkills = [];
  const seenSkillIds = new Set();

  for (const row of baselineSkills) {
    const pob = pobNodeById[row.Id];
    outSkills.push(pob ? mergeSkillRow(row, pob) : { ...row });
    seenSkillIds.add(row.Id);
  }

  for (const n of pobNodes) {
    if (!n.id || seenSkillIds.has(n.id)) continue;
    maxSkillKey += 1;
    const syn = synthesizeSkillFromPob(n, statsById, maxSkillKey, skipMissing);
    if (syn == null) {
      maxSkillKey -= 1;
      console.warn(`Пропуск node ${n.id}: нет stat id / префикса для AlternateTreeVersionsKey`);
      continue;
    }
    outSkills.push(syn);
    seenSkillIds.add(n.id);
  }

  outSkills.sort((a, b) => a._key - b._key);

  const outAdds = [];
  const seenAddIds = new Set();

  for (const row of baselineAdds) {
    seenAddIds.add(row.Id);
    outAdds.push({ ...row });
  }

  for (const a of pobAdds) {
    if (!a.id || seenAddIds.has(a.id)) continue;
    maxAddKey += 1;
    const syn = synthesizeAdditionFromPob(a, statsById, maxAddKey, skipMissing);
    if (syn == null) {
      maxAddKey -= 1;
      console.warn(`Пропуск addition ${a.id}: нет stat id / префикса для AlternateTreeVersionsKey`);
      continue;
    }
    outAdds.push(syn);
    seenAddIds.add(a.id);
  }

  outAdds.sort((a, b) => a._key - b._key);

  const outSkillsPath = join(DATA, 'alternate_passive_skills.json.gz');
  const outAddsPath = join(DATA, 'alternate_passive_additions.json.gz');
  writeJsonGz(outSkills, outSkillsPath);
  writeJsonGz(outAdds, outAddsPath);

  console.log(`Wrote ${outSkills.length} skills → ${outSkillsPath}`);
  console.log(`Wrote ${outAdds.length} additions → ${outAddsPath}`);
  console.log('Дальше: npm run wasm:build (или полный pipeline) для пересборки calculator.wasm');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
