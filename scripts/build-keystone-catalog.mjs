#!/usr/bin/env node
/**
 * Каталог кейстоунов timeless/abyss → src/lib/keystoneCatalog.json
 * Источники: APS + stats + PoB EN display + RU dict.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { gunzipSync } from "zlib";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** jewel → (conquerorIndex, conquerorVersion) → EN name (как в TimelessJewelConquerors). */
const CONQUEROR_BY_JEWEL = {
  1: {
    "1:0": "Xibaqua",
    "2:0": "Zerphi",
    "2:1": "Ahuana",
    "3:0": "Doryani",
  },
  2: {
    "1:0": "Kaom",
    "2:0": "Rakiata",
    "3:0": "Kiloava",
    "3:1": "Akoya",
  },
  3: {
    "1:0": "Deshret",
    "1:1": "Balbala",
    "2:0": "Asenath",
    "3:0": "Nasima",
  },
  4: {
    "1:0": "Venarius",
    "1:1": "Maxarius",
    "2:0": "Dominus",
    "3:0": "Avarius",
  },
  5: {
    "1:0": "Cadiro",
    "2:0": "Victario",
    "3:0": "Chitus",
    "3:1": "Caspiro",
  },
  6: {
    "1:0": "Black Scythe Training",
    "2:0": "Celestial Mathematics",
    "3:0": "The Unbreaking Circle",
  },
  7: { "0:0": "Tecrod" },
  8: { "0:0": "Ulaman" },
  9: { "0:0": "Kurgal" },
  10: { "0:0": "Amanamu" },
};

const JEWEL_EN = {
  1: "Glorious Vanity",
  2: "Lethal Pride",
  3: "Brutal Restraint",
  4: "Militant Faith",
  5: "Elegant Hubris",
  6: "Heroic Tragedy",
  7: "Festering Vengeance",
  8: "Extinguishing Grasp",
  9: "Baleful Dominion",
  10: "Destructive Aspiration",
};

function loadGzJson(path) {
  return JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
}

function parseTsStringRecord(path, exportName) {
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`export ${exportName} not found in ${path}`);
  const brace = text.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = brace; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`unclosed object for ${exportName}`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${text.slice(brace, end + 1)});`)();
}

function stripMarkup(s) {
  return s
    .replace(/\[DNT\]\s*/g, "")
    .replace(/\[[^\[\]|]+\|([^\[\]]+)\]/g, "$1");
}

function main() {
  const aps = loadGzJson(join(ROOT, "data/alternate_passive_skills.json.gz"));
  const stats = loadGzJson(join(ROOT, "data/stats.json.gz"));
  const statIdByKey = new Map(stats.map((s) => [s._key, s.Id]));
  const pobEn = JSON.parse(
    readFileSync(join(ROOT, "src/lib/alternatePassiveDisplayEnById.json"), "utf8"),
  );
  const namesRu = parseTsStringRecord(
    join(ROOT, "src/lib/passiveNamesById.generated.ts"),
    "passiveNamesRuByIdGenerated",
  );
  const templatesRu = parseTsStringRecord(
    join(ROOT, "src/lib/statNamesByStringId.generated.ts"),
    "statNamesRuByStringIdGenerated",
  );

  const entries = [];
  for (const row of aps) {
    const types = row.PassiveType || [];
    if (!types.includes(4)) continue; // KeyStone only
    const jewel = row.AlternateTreeVersionsKey;
    if (!JEWEL_EN[jewel]) continue;
    const idx = row.Unknown8 ?? 0;
    const ver = row.Unknown9 ?? 0;
    const conqueror = CONQUEROR_BY_JEWEL[jewel]?.[`${idx}:${ver}`];
    if (!conqueror) {
      console.warn("No conqueror for", row.Id, jewel, idx, ver);
      continue;
    }
    const id = row.Id;
    const statIds = (row.StatsKeys || [])
      .map((k) => statIdByKey.get(k))
      .filter(Boolean);
    const linesRu = [];
    for (const sid of statIds) {
      const t = templatesRu[sid];
      if (t) {
        for (const line of stripMarkup(t).split("\n")) {
          if (line.trim()) linesRu.push(line.trim());
        }
      }
    }
    const linesEn = pobEn[id]?.length
      ? pobEn[id]
      : statIds.map((sid) => sid.replace(/_/g, " "));

    entries.push({
      id,
      jewel,
      jewelEn: JEWEL_EN[jewel],
      conqueror,
      nameEn: row.Name || id,
      nameRu: namesRu[id] || row.Name || id,
      linesEn,
      linesRu: linesRu.length ? linesRu : linesEn,
      conquerorIndex: idx,
      conquerorVersion: ver,
    });
  }

  entries.sort((a, b) => a.jewel - b.jewel || a.conqueror.localeCompare(b.conqueror));

  const out = join(ROOT, "src/lib/keystoneCatalog.json");
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
  console.log(`Wrote ${entries.length} keystones → ${out}`);
}

main();
