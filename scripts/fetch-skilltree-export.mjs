#!/usr/bin/env node
/**
 * Fetch official PoE1 passive tree exports from GGG.
 * Source: https://github.com/grindinggear/skilltree-export
 *
 * By default, uses 3.28.0 (latest known complete tree export).
 * You can override ref: node scripts/fetch-skilltree-export.mjs <ref>
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'src', 'temp', 'en', 'skilltree-export');

const FILES = ['data.json', 'alternate.json', 'ruthless.json', 'ruthless-alternate.json'];

function resolveRef() {
  const argRef = process.argv[2]?.trim();
  if (argRef) return argRef;
  return '3.28.0';
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'timeless-jewels-poe-fetcher/1.0',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function tryRef(ref) {
  const base = `https://raw.githubusercontent.com/grindinggear/skilltree-export/${ref}`;
  const downloaded = [];

  for (const file of FILES) {
    const url = `${base}/${file}`;
    process.stdout.write(`[${ref}] ${file} ... `);
    try {
      const content = await fetchText(url);
      downloaded.push({ file, content });
      console.log('ok');
    } catch (e) {
      console.log(`fail (${String(e.message || e)})`);
      return { ok: false };
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const { file, content } of downloaded) {
    writeFileSync(join(OUT_DIR, file), content, 'utf8');
  }
  writeFileSync(
    join(OUT_DIR, 'skilltree-export.meta.json'),
    JSON.stringify(
      {
        source: 'https://github.com/grindinggear/skilltree-export',
        resolvedRef: ref,
        generatedAt: new Date().toISOString(),
        files: FILES,
      },
      null,
      2,
    ),
    'utf8',
  );

  return { ok: true };
}

async function main() {
  const preferred = resolveRef();
  const refs = preferred === 'master' ? ['master'] : [preferred, 'master'];

  for (const ref of refs) {
    const r = await tryRef(ref);
    if (r.ok) {
      console.log(`Saved skilltree-export files to ${OUT_DIR} (ref: ${ref})`);
      return;
    }
  }

  throw new Error('Failed to fetch skilltree-export for all candidate refs');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
