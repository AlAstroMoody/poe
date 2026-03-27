#!/usr/bin/env node
/**
 * Fetch go-pob-data assets required by Go/WASM embed pipeline.
 *
 * Usage:
 *   node scripts/fetch-go-pob-data.mjs                # tries default fallback versions
 *   node scripts/fetch-go-pob-data.mjs 3.28          # try 3.28 then fallback list
 *   node scripts/fetch-go-pob-data.mjs 3.28,3.27     # explicit ordered list
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'data');

const fallbackVersions = ['3.28', '3.27', '3.26', '3.25', '3.24', '3.23', '3.22', '3.21'];
const arg = process.argv[2];
const requested = arg
  ? arg.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const versions = [...new Set([...requested, ...fallbackVersions])];

const files = [
  {
    out: 'alternate_passive_additions.json.gz',
    path: (v) => `data/${v}/raw/AlternatePassiveAdditions.json.gz`
  },
  {
    out: 'alternate_passive_skills.json.gz',
    path: (v) => `data/${v}/raw/AlternatePassiveSkills.json.gz`
  },
  {
    out: 'alternate_tree_versions.json.gz',
    path: (v) => `data/${v}/raw/AlternateTreeVersions.json.gz`
  },
  {
    out: 'passive_skills.json.gz',
    path: (v) => `data/${v}/raw/PassiveSkills.json.gz`
  },
  {
    out: 'stats.json.gz',
    path: (v) => `data/${v}/raw/Stats.json.gz`
  },
  {
    out: 'stat_descriptions.json.gz',
    path: (v) => `data/${v}/stat_translations/en/stat_descriptions.json.gz`
  },
  {
    out: 'passive_skill_stat_descriptions.json.gz',
    path: (v) => `data/${v}/stat_translations/en/passive_skill_stat_descriptions.json.gz`
  },
  {
    out: 'passive_skill_aura_stat_descriptions.json.gz',
    path: (v) => `data/${v}/stat_translations/en/passive_skill_aura_stat_descriptions.json.gz`
  },
  {
    out: 'stat_descriptions_ru.json.gz',
    path: (v) => `data/${v}/stat_translations/ru/stat_descriptions.json.gz`
  },
  {
    out: 'passive_skill_stat_descriptions_ru.json.gz',
    path: (v) => `data/${v}/stat_translations/ru/passive_skill_stat_descriptions.json.gz`
  },
  {
    out: 'passive_skill_aura_stat_descriptions_ru.json.gz',
    path: (v) => `data/${v}/stat_translations/ru/passive_skill_aura_stat_descriptions.json.gz`
  }
];

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'timeless-jewels-poe-fetcher/1.0',
      Accept: '*/*'
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    throw new Error('Empty body');
  }
  return buf;
}

async function tryVersion(version) {
  const base = 'https://go-pob-data.pages.dev';
  const downloaded = [];

  for (const f of files) {
    const url = `${base}/${f.path(version)}`;
    process.stdout.write(`[${version}] ${f.out} ... `);
    try {
      const data = await fetchBuffer(url);
      downloaded.push({ out: f.out, data });
      console.log(`ok (${data.length} bytes)`);
    } catch (e) {
      console.log(`fail (${String(e.message || e)})`);
      return { ok: false, reason: `failed at ${f.out}` };
    }
  }

  mkdirSync(OUT, { recursive: true });
  for (const f of downloaded) {
    writeFileSync(join(OUT, f.out), f.data);
  }

  return { ok: true };
}

async function main() {
  console.log('Trying go-pob-data versions:', versions.join(', '));

  for (const version of versions) {
    const result = await tryVersion(version);
    if (result.ok) {
      const meta = {
        source: 'https://go-pob-data.pages.dev',
        resolvedVersion: version,
        generatedAt: new Date().toISOString(),
        files: files.map((f) => f.out),
      };
      writeFileSync(join(OUT, 'go-pob-data.meta.json'), JSON.stringify(meta, null, 2), 'utf8');
      console.log(`\nFetched go-pob-data assets for version ${version} -> ${OUT}`);
      return;
    }
    console.log(`Version ${version} skipped: ${result.reason}`);
  }

  throw new Error('Could not fetch required go-pob-data assets for any tested version');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
