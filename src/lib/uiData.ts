/**
 * UI-данные, вынесенные из WASM в public/data/*.json.gz:
 * SkillTree, EN stat_descriptions, possible_stats.
 * Калькулятор их не использует — грузим отдельно (параллельно с WASM).
 */

import { withAssetVersion } from "@/lib/assetVersion";

export type PossibleStatsMap = Record<number, Record<string, number>>;

let skillTreeJson: string | null = null;
let possibleStats: PossibleStatsMap | null = null;
let translations: {
  general: string;
  passive: string;
  aura: string;
} | null = null;

let loadPromise: Promise<void> | null = null;

function dataUrl(file: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return withAssetVersion(`${base}/data/${file}`);
}

async function fetchGzipText(file: string): Promise<string> {
  const res = await fetch(dataUrl(file));
  if (!res.ok) throw new Error(`Failed to load ${file}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream unavailable — cannot gunzip UI data");
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

/** Параллельная загрузка всех UI-блобов. Идемпотентно. */
export function loadUiData(): Promise<void> {
  if (skillTreeJson && possibleStats && translations) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [tree, possible, general, passive, aura] = await Promise.all([
      fetchGzipText("SkillTree.json.gz"),
      fetchGzipText("possible_stats.json.gz"),
      fetchGzipText("stat_descriptions.json.gz"),
      fetchGzipText("passive_skill_stat_descriptions.json.gz"),
      fetchGzipText("passive_skill_aura_stat_descriptions.json.gz"),
    ]);
    skillTreeJson = tree;
    possibleStats = JSON.parse(possible) as PossibleStatsMap;
    translations = { general, passive, aura };
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

export function getSkillTreeJson(): string {
  if (!skillTreeJson) {
    throw new Error("UI data not loaded (SkillTree). Call loadUiData() first.");
  }
  return skillTreeJson;
}

export function getPossibleStats(): PossibleStatsMap {
  if (!possibleStats) {
    throw new Error(
      "UI data not loaded (PossibleStats). Call loadUiData() first.",
    );
  }
  return possibleStats;
}

export function getEnglishTranslationLayers(): {
  StatTranslationsJSON: string;
  PassiveSkillStatTranslationsJSON: string;
  PassiveSkillAuraStatTranslationsJSON: string;
} {
  if (!translations) {
    throw new Error(
      "UI data not loaded (translations). Call loadUiData() first.",
    );
  }
  return {
    StatTranslationsJSON: translations.general,
    PassiveSkillStatTranslationsJSON: translations.passive,
    PassiveSkillAuraStatTranslationsJSON: translations.aura,
  };
}

export function isUiDataReady(): boolean {
  return !!(skillTreeJson && possibleStats && translations);
}
