#!/usr/bin/env node
/**
 * Конвертирует JSON из `pypoe_exporter dat json <out.json>` (массив блоков
 * `{ filename, header, data }`) в формат файлов для `data/main.go` (go:embed):
 * массив объектов построчно, как у go-pob-data.
 *
 * Что нужно с вашей стороны ПЕРЕД запуском:
 *
 * Пути к GGPK, PyPoE и каталогу экспорта можно задать в `.env.poe` (шаблон: `.env.poe.example`),
 * затем: `source scripts/load-poe-env.sh` — будут доступны POE_GGPK_DIR, POE_DAT_EXPORT_DIR, POE_PYPOE_DIR.
 *
 * 1. Экспорт из PyPoE (config: ggpk_path на каталог с Content.ggpk), вывод — например:
 *    $POE_DAT_EXPORT_DIR
 *
 *    poetry run pypoe_exporter dat json /home/le/src/poe-dat-out/alternate_bundle.json \\
 *      --files AlternateTreeVersions.dat AlternatePassiveSkills.dat AlternatePassiveAdditions.dat Stats.dat PassiveSkills.dat
 *
 *    В одном файле может быть только Stats — тогда скрипт не найдёт альтеры.
 *    Проверка: jq '[.[].filename]' /home/le/src/poe-dat-out/alternate_bundle.json
 *
 * 2. Запуск из корня репозитория (конвертация в data/*.json.gz этого проекта):
 *
 *    npm run import:pypoe-bundle -- /home/le/src/poe-dat-out/alternate_bundle.json
 *
 * Результат: перезапись data/*.json(.gz) для каждой найденной таблицы (в т.ч. stats).
 * Важно: класть в проект нужно результат этого скрипта, а не сырой JSON PyPoE.
 *
 * После этого: npm run wasm:build
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { gzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/** Имя таблицы в PyPoE → базовое имя файла в data/ (без .json) */
const TABLE_MAP = {
  'AlternateTreeVersions.dat': 'alternate_tree_versions',
  'AlternatePassiveSkills.dat': 'alternate_passive_skills',
  'AlternatePassiveAdditions.dat': 'alternate_passive_additions',
  'Stats.dat': 'stats',
};

function usage() {
  console.error(`Usage: node scripts/import-pypoe-dat-bundle.mjs <bundle.json> [outDir]

  outDir default: ${join(ROOT, 'data')}
`);
  process.exit(1);
}

/**
 * @param {{ header: Array<{ name: string, rowid: number }>, data: unknown[][] }} block
 */
function blockToRows(block) {
  if (!block.header?.length || !Array.isArray(block.data)) {
    throw new Error('Invalid block: need header and data arrays');
  }

  const sorted = [...block.header].sort((a, b) => a.rowid - b.rowid);
  const names = sorted.map((h) => h.name);

  return block.data.map((row, rowIndex) => {
    const obj = {};
    for (let i = 0; i < names.length; i++) {
      const key = names[i];
      obj[key] = row[i];
    }
    // Индекс строки в .dat: чаще всего поле Key в схеме; в проекте ожидается _key
    if (obj._key === undefined && obj.Key !== undefined) {
      obj._key = obj.Key;
    }
    if (obj._key === undefined) {
      obj._key = rowIndex;
    }
    return obj;
  });
}

function main() {
  const bundlePath = process.argv[2];
  const outDir = process.argv[3] ? join(process.argv[3]) : join(ROOT, 'data');

  if (!bundlePath || !existsSync(bundlePath)) {
    console.error('Missing or invalid bundle path:', bundlePath);
    usage();
  }

  const raw = readFileSync(bundlePath, 'utf8');
  /** @type {Array<{ filename: string, header: unknown[], data: unknown[][] }>} */
  const bundle = JSON.parse(raw);
  if (!Array.isArray(bundle)) {
    throw new Error('Bundle must be a JSON array of export blocks');
  }

  mkdirSync(outDir, { recursive: true });

  const found = new Set();
  for (const block of bundle) {
    const fn = block.filename;
    const base = TABLE_MAP[fn];
    if (!base) continue;

    let rows = blockToRows(block);
    if (fn === 'Stats.dat') {
      rows = rows.map((row) => {
        const id = row.Id != null ? String(row.Id) : '';
        return {
          ...row,
          Text:
            row.Text != null && row.Text !== ''
              ? String(row.Text)
              : id.replace(/_/g, ' '),
        };
      });
    }
    const jsonPath = join(outDir, `${base}.json`);
    const gzPath = `${jsonPath}.gz`;
    const body = JSON.stringify(rows);
    writeFileSync(jsonPath, body, 'utf8');
    writeFileSync(gzPath, gzipSync(Buffer.from(body, 'utf8')));
    found.add(fn);
    console.log(`Wrote ${rows.length} rows -> ${jsonPath} (+ .gz)`);
  }

  const expected = Object.keys(TABLE_MAP);
  const missing = expected.filter((k) => !found.has(k));
  if (missing.length) {
    console.warn(
      '\nNote: в бандле не было таблиц:\n  - ' +
        missing.join('\n  - ') +
        '\n(это нормально, если импортируете только часть файлов.)',
    );
  }
  if (found.size === 0) {
    console.error('Ошибка: ни одна таблица из TABLE_MAP не найдена в JSON.');
    process.exit(1);
  }
}

main();
