#!/usr/bin/env node
/**
 * Prepare data artifacts:
 * - WASM embeds (data/*.json.gz → go:embed): calc tables + applicable_passive_indices
 * - UI fetch (public/data/*.json.gz): SkillTree, EN translations, possible_stats
 *
 * SkillTree / translations / PossibleStats больше не в WASM.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { gzipSync, gunzipSync } from "zlib";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC_SKILLTREE = join(
  ROOT,
  "src",
  "temp",
  "en",
  "skilltree-export",
  "data.json",
);
const SRC_ALTERNATE = join(
  ROOT,
  "src",
  "temp",
  "en",
  "skilltree-export",
  "alternate.json",
);
const OUT = join(ROOT, "data");
const PUBLIC_DATA = join(ROOT, "public", "data");

/** Required by data/main.go go:embed (calc only). */
const REQUIRED_WASM_GZ = [
  "alternate_passive_additions.json.gz",
  "alternate_passive_skills.json.gz",
  "alternate_tree_versions.json.gz",
  "passive_skills.json.gz",
  "stats.json.gz",
  "applicable_passive_indices.json.gz",
];

/** Copied to public/data for frontend fetch (with ?v=). */
const PUBLIC_UI_GZ = [
  "SkillTree.json.gz",
  "stat_descriptions.json.gz",
  "passive_skill_stat_descriptions.json.gz",
  "passive_skill_aura_stat_descriptions.json.gz",
  "possible_stats.json.gz",
];

function mustExist(path, hint) {
  if (!existsSync(path)) {
    throw new Error(`Missing file: ${path}${hint ? `\n${hint}` : ""}`);
  }
}

function writeGzipJson(outJsonPath, parsed) {
  const json = JSON.stringify(parsed);
  writeFileSync(outJsonPath, json, "utf8");
  writeFileSync(`${outJsonPath}.gz`, gzipSync(Buffer.from(json, "utf8")));
}

/**
 * Если SkillTree новее passive_skills (например 3.29 vs 3.28), для части graph id нет строки
 * в PassiveSkills — TreeToPassive[skill] = nil и альтернатива не считается.
 * Добавляем минимальные записи: флаги из ноды дерева, Stats: [] (тип ноды — по IsNotable / и т.д.).
 */
function mergePassiveSkillStubsFromSkillTree(skillTree, passiveSkillsPath) {
  if (!existsSync(passiveSkillsPath)) return 0;
  const raw = gunzipSync(readFileSync(passiveSkillsPath));
  const passiveSkills = JSON.parse(raw.toString("utf8"));
  if (!Array.isArray(passiveSkills)) return 0;

  const byGraph = new Set();
  let maxKey = 0;
  for (const row of passiveSkills) {
    const gid = row.PassiveSkillGraphId ?? row.PassiveSkillGraphID;
    if (gid != null) byGraph.add(Number(gid));
    if (row._key != null && row._key > maxKey) maxKey = row._key;
  }

  const nodes = skillTree.nodes || {};
  let added = 0;
  for (const n of Object.values(nodes)) {
    const sid = n.skill;
    if (sid == null) continue;
    const sidNum = Number(sid);
    if (Number.isNaN(sidNum)) continue;
    if (byGraph.has(sidNum)) continue;

    maxKey += 1;
    passiveSkills.push({
      _key: maxKey,
      Id: `skilltree_stub_${sidNum}`,
      Stats: [],
      PassiveSkillGraphId: sidNum,
      Name: typeof n.name === "string" ? n.name : "",
      IsKeystone: !!n.isKeystone,
      IsNotable: !!n.isNotable,
      IsJewelSocket: !!n.isJewelSocket,
    });
    byGraph.add(sidNum);
    added += 1;
  }

  if (added === 0) return 0;

  const json = JSON.stringify(passiveSkills);
  const outJson = passiveSkillsPath.replace(/\.gz$/, "");
  writeFileSync(outJson, json, "utf8");
  writeFileSync(passiveSkillsPath, gzipSync(Buffer.from(json, "utf8")));
  return added;
}

/** Индексы _key для GetApplicablePassives без SkillTree в WASM. */
function writeApplicablePassiveIndices(skillTree, passiveSkillsPath) {
  const raw = gunzipSync(readFileSync(passiveSkillsPath));
  const passiveSkills = JSON.parse(raw.toString("utf8"));
  const nodes = skillTree.nodes || {};
  const indices = [];

  for (const skill of passiveSkills) {
    if (!skill?.Name || skill.IsJewelSocket) continue;
    const gid = skill.PassiveSkillGraphId ?? skill.PassiveSkillGraphID;
    if (gid == null) continue;
    const node = nodes[String(gid)];
    if (!node) continue;
    if (node.ascendancyName) continue;
    if (node.isProxy) continue;
    if (node.isBlighted) continue;
    if (node.isMastery) continue;
    const key = skill._key ?? skill.Index;
    if (typeof key === "number") indices.push(key);
  }

  writeGzipJson(join(OUT, "applicable_passive_indices.json"), indices);
  console.log(
    `Wrote applicable_passive_indices.json.gz (${indices.length} indices)`,
  );
  return indices.length;
}

function syncPublicUiData() {
  mkdirSync(PUBLIC_DATA, { recursive: true });
  for (const file of PUBLIC_UI_GZ) {
    const src = join(OUT, file);
    mustExist(src, `Need ${file} in data/ before syncing public/data`);
    copyFileSync(src, join(PUBLIC_DATA, file));
  }
  console.log("Synced UI data → public/data:", PUBLIC_UI_GZ.length, "files");
}

function main() {
  mkdirSync(OUT, { recursive: true });

  // 1) Update SkillTree from official GGG export
  mustExist(SRC_SKILLTREE, "Run: npm run fetch:skilltree-export");
  const skillTreeRaw = readFileSync(SRC_SKILLTREE, "utf8");
  const skillTree = JSON.parse(skillTreeRaw);

  if (existsSync(SRC_ALTERNATE)) {
    try {
      const altRaw = readFileSync(SRC_ALTERNATE, "utf8");
      const altTree = JSON.parse(altRaw);
      if (altTree.sprites && altTree.sprites.jewelRadius) {
        skillTree.sprites = skillTree.sprites || {};
        skillTree.sprites.jewelRadius = altTree.sprites.jewelRadius;
        console.log(
          "Merged jewelRadius sprites from alternate.json into SkillTree.json",
        );
      }
    } catch (e) {
      console.warn("Failed to merge sprites from alternate.json:", e.message);
    }
  }

  if (!skillTree || typeof skillTree !== "object" || Array.isArray(skillTree)) {
    throw new Error("Invalid skilltree-export data.json shape");
  }
  writeGzipJson(join(OUT, "SkillTree.json"), skillTree);

  const stubs = mergePassiveSkillStubsFromSkillTree(
    skillTree,
    join(OUT, "passive_skills.json.gz"),
  );
  if (stubs > 0) {
    console.log(
      `Merged ${stubs} passive_skills stub(s) for SkillTree graph ids missing from PassiveSkills.dat export`,
    );
  }

  const applicableCount = writeApplicablePassiveIndices(
    skillTree,
    join(OUT, "passive_skills.json.gz"),
  );

  // Keep raw snapshots for debugging / diffing
  const snapshots = [
    ["data.json", "skilltree-export.data.json"],
    ["alternate.json", "skilltree-export.alternate.json"],
    ["ruthless.json", "skilltree-export.ruthless.json"],
    ["ruthless-alternate.json", "skilltree-export.ruthless-alternate.json"],
  ];
  for (const [srcName, outName] of snapshots) {
    const src = join(ROOT, "src", "temp", "en", "skilltree-export", srcName);
    if (!existsSync(src)) continue;
    const raw = readFileSync(src, "utf8");
    const parsed = JSON.parse(raw);
    writeFileSync(join(OUT, outName), JSON.stringify(parsed), "utf8");
  }

  // 2) Validate WASM embed inputs
  const missing = [];
  for (const file of REQUIRED_WASM_GZ) {
    const p = join(OUT, file);
    if (!existsSync(p)) missing.push(file);
  }
  if (missing.length) {
    throw new Error(
      `Missing required data/*.json.gz for wasm build:\n- ${missing.join("\n- ")}\n` +
        "Copy/generate these files into poe/data before running wasm:build.",
    );
  }

  // 3) Sync UI blobs to public/data (also validate they exist)
  for (const file of PUBLIC_UI_GZ) {
    mustExist(join(OUT, file), `UI asset missing: ${file}`);
  }
  syncPublicUiData();

  // 4) Metadata
  const metadata = {
    source: {
      skilltreeExport:
        "https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json",
    },
    generatedAt: new Date().toISOString(),
    updated: [
      "SkillTree.json",
      "SkillTree.json.gz",
      "applicable_passive_indices.json.gz",
      "passive_skills.json.gz (stubs if any)",
      "public/data/* (UI fetch)",
    ],
    passiveSkillStubsMerged: stubs,
    applicablePassiveIndices: applicableCount,
    validatedWasmGzCount: REQUIRED_WASM_GZ.length,
    publicUiGzCount: PUBLIC_UI_GZ.length,
  };
  writeFileSync(
    join(OUT, "prepare-wasm-data.meta.json"),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );

  console.log("Prepared wasm data in", OUT);
  console.log("Updated: SkillTree + applicable_passive_indices + public/data");
  console.log("Validated WASM gzip assets:", REQUIRED_WASM_GZ.length);
}

main();
