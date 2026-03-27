#!/usr/bin/env node
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { gunzipSync } from "zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

const REQUIRED_GZ = [
  "alternate_passive_additions.json.gz",
  "alternate_passive_skills.json.gz",
  "alternate_tree_versions.json.gz",
  "passive_skills.json.gz",
  "stats.json.gz",
  "SkillTree.json.gz",
  "stat_descriptions.json.gz",
  "passive_skill_stat_descriptions.json.gz",
  "passive_skill_aura_stat_descriptions.json.gz",
  "stat_descriptions_ru.json.gz",
  "passive_skill_stat_descriptions_ru.json.gz",
  "passive_skill_aura_stat_descriptions_ru.json.gz",
  "possible_stats.json.gz",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function countSkillTreeNodes() {
  const path = join(DATA, "SkillTree.json.gz");
  const raw = gunzipSync(readFileSync(path)).toString("utf8");
  const parsed = JSON.parse(raw);
  return Object.keys(parsed?.nodes ?? {}).length;
}

function main() {
  const critical = [];
  const warnings = [];
  const info = [];

  for (const file of REQUIRED_GZ) {
    const p = join(DATA, file);
    if (!existsSync(p)) critical.push(`Missing ${file}`);
  }

  const wasmPath = join(ROOT, "public", "calculator.wasm");
  if (!existsSync(wasmPath)) {
    critical.push("Missing public/calculator.wasm (run npm run wasm:build)");
  }

  const skilltreeMetaPath = join(
    ROOT,
    "src",
    "temp",
    "en",
    "skilltree-export",
    "skilltree-export.meta.json",
  );
  if (!existsSync(skilltreeMetaPath)) {
    critical.push("Missing skilltree-export.meta.json (run npm run fetch:skilltree-export)");
  }

  const prepareMetaPath = join(DATA, "prepare-wasm-data.meta.json");
  if (!existsSync(prepareMetaPath)) {
    critical.push("Missing prepare-wasm-data.meta.json (run npm run prepare:wasm-data)");
  }

  const goPobMetaPath = join(DATA, "go-pob-data.meta.json");
  if (!existsSync(goPobMetaPath)) {
    warnings.push("go-pob-data.meta.json is missing (raw stats/passives source unknown)");
  }

  if (!critical.length) {
    try {
      const skilltreeMeta = readJson(skilltreeMetaPath);
      const ref = skilltreeMeta.resolvedRef;
      info.push(`skilltree-export ref: ${ref}`);
      if (ref !== "3.28.0") {
        warnings.push(`skilltree-export ref is ${ref}, expected 3.28.0`);
      }
    } catch {
      critical.push("Cannot parse skilltree-export.meta.json");
    }

    try {
      const prepareMeta = readJson(prepareMetaPath);
      const stubs = Number(prepareMeta.passiveSkillStubsMerged ?? 0);
      info.push(`passive skill stubs merged: ${stubs}`);
      if (stubs > 0) {
        warnings.push(
          `${stubs} passive skill stubs were added (data mismatch between SkillTree and PassiveSkills)`,
        );
      }
    } catch {
      critical.push("Cannot parse prepare-wasm-data.meta.json");
    }

    try {
      const nodesCount = countSkillTreeNodes();
      info.push(`SkillTree nodes: ${nodesCount}`);
      if (nodesCount < 3300) {
        warnings.push(`SkillTree nodes count looks low (${nodesCount})`);
      }
    } catch {
      critical.push("Cannot parse data/SkillTree.json.gz");
    }

    if (existsSync(goPobMetaPath)) {
      try {
        const goPobMeta = readJson(goPobMetaPath);
        info.push(`go-pob-data version: ${goPobMeta.resolvedVersion}`);
        if (goPobMeta.resolvedVersion !== "3.28") {
          warnings.push(`go-pob-data version is ${goPobMeta.resolvedVersion} (not 3.28)`);
        }
      } catch {
        warnings.push("Cannot parse go-pob-data.meta.json");
      }
    }
  }

  console.log("=== Release Readiness Check ===");
  for (const line of info) console.log(`INFO: ${line}`);
  for (const line of warnings) console.log(`WARN: ${line}`);
  for (const line of critical) console.log(`FAIL: ${line}`);

  if (critical.length) {
    console.log("STATUS: BLOCKED - do not deploy");
    process.exit(1);
  }

  if (warnings.length) {
    console.log("STATUS: READY_WITH_WARNINGS - deploy with caution");
  } else {
    console.log("STATUS: READY - safe to deploy");
  }
}

main();

