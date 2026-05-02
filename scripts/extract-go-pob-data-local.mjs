#!/usr/bin/env node
/**
 * Copy gzip JSON produced by локального запуска go-pob-data после `go run .` into poe/data/
 * using the same filenames as fetch-go-pob-data.mjs (snake_case).
 *
 * Prerequisites (если ваш клиент совместим с загрузчиком бандлов go-pob-data; иначе этот шаг не по пути Poetry/PyPoE): run extraction in go-pob-data repo:
 *   cd "$GO_POB_DATA_DIR"
 *   ./extract.sh "<Path of Exile/>" "<skilltree-export tag>" "<game folder version>"
 * or see scripts/run-go-pob-data-extract.sh
 *
 * Usage:
 *   POE_GAME_VERSION=3.28.0.7 GO_POB_DATA_DIR=~/src/go-pob-data node scripts/extract-go-pob-data-local.mjs
 *
 * Env:
 *   POE_GAME_VERSION — folder under go-pob-data/data/<this>/ (third arg to main.go), e.g. 3.28.0.7
 *   GO_POB_DATA_DIR — absolute path to cloned go-pob-data (default: ../go-pob-data relative to repo root)
 */

import { mkdirSync, copyFileSync, existsSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'data');

/** go-pob-data PascalCase basename (no .gz) → filename in our data/ */
const RAW_MAP = [
  ['AlternatePassiveAdditions', 'alternate_passive_additions.json.gz'],
  ['AlternatePassiveSkills', 'alternate_passive_skills.json.gz'],
  ['AlternateTreeVersions', 'alternate_tree_versions.json.gz'],
  ['PassiveSkills', 'passive_skills.json.gz'],
  ['Stats', 'stats.json.gz'],
];

const TRANS_MAP = [
  ['stat_translations/en/stat_descriptions.json.gz', 'stat_descriptions.json.gz'],
  [
    'stat_translations/en/passive_skill_stat_descriptions.json.gz',
    'passive_skill_stat_descriptions.json.gz',
  ],
  [
    'stat_translations/en/passive_skill_aura_stat_descriptions.json.gz',
    'passive_skill_aura_stat_descriptions.json.gz',
  ],
  ['stat_translations/ru/stat_descriptions.json.gz', 'stat_descriptions_ru.json.gz'],
  [
    'stat_translations/ru/passive_skill_stat_descriptions.json.gz',
    'passive_skill_stat_descriptions_ru.json.gz',
  ],
  [
    'stat_translations/ru/passive_skill_aura_stat_descriptions.json.gz',
    'passive_skill_aura_stat_descriptions_ru.json.gz',
  ],
];

function copyIfExists(src, destLabel) {
  const dest = join(OUT, destLabel);
  if (!existsSync(src)) {
    console.warn(`skip (missing): ${src}`);
    return false;
  }
  mkdirSync(OUT, { recursive: true });
  copyFileSync(src, dest);
  const st = statSync(src);
  console.log(`ok ${destLabel} (${st.size} bytes)`);
  return true;
}

function main() {
  const gameVer =
    process.env.POE_GAME_VERSION ||
    process.argv[2] ||
    (() => {
      throw new Error(
        'Set POE_GAME_VERSION (e.g. 3.28.0.7) — same as third argument to go-pob-data main.go',
      );
    })();

  const goPobRoot =
    process.env.GO_POB_DATA_DIR || join(ROOT, '..', 'go-pob-data');
  const base = join(goPobRoot, 'data', gameVer);

  if (!existsSync(base)) {
    throw new Error(
      `Expected output dir missing: ${base}\nClone go-pob-data and run extraction first.`,
    );
  }

  let n = 0;
  for (const [pascal, outName] of RAW_MAP) {
    const src = join(base, 'raw', `${pascal}.json.gz`);
    if (copyIfExists(src, outName)) n += 1;
  }
  for (const [rel, outName] of TRANS_MAP) {
    const src = join(base, rel);
    if (copyIfExists(src, outName)) n += 1;
  }

  const meta = {
    source: 'local go-pob-data extract',
    resolvedVersion: gameVer,
    goPobDataDir: goPobRoot,
    generatedAt: new Date().toISOString(),
    filesCopied: n,
  };
  writeFileSync(join(OUT, 'go-pob-data-local.meta.json'), JSON.stringify(meta, null, 2), 'utf8');

  if (!existsSync(join(OUT, 'possible_stats.json.gz'))) {
    console.warn(
      '\ngo-pob-data does not emit possible_stats.json.gz. Keep your existing data/possible_stats.json.gz from your pipeline or another source.',
    );
  }

  console.log(`\nCopied ${n} file(s) -> ${OUT}`);
  console.log('Next: npm run fetch:skilltree-export && npm run prepare:wasm-data && npm run wasm:build');
}

main();
