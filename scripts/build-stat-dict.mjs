#!/usr/bin/env node
/**
 * Собирает словарь переводов статов и названий нод из src/temp/ (ru и en) и public/data.
 * Только строковые id статов, без индексов.
 * Запуск из корня frontend-vue: node scripts/build-stat-dict.mjs (или npm run build:dict).
 * Результат: src/lib/*.generated.ts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { gunzipSync } from "zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMP_RU = join(ROOT, "src", "temp", "ru");
const TEMP_EN = join(ROOT, "src", "temp", "en");
const PUBLIC_DATA = join(ROOT, "public", "data");
const OUT_DIR = join(ROOT, "src", "lib");
const OUT_FILE = join(OUT_DIR, "statNamesRu.generated.ts");

/** Прочитать JSON или gzip JSON */
function loadJson(path) {
  const raw = path.endsWith(".gz")
    ? gunzipSync(readFileSync(path)).toString("utf8")
    : readFileSync(path, "utf8");
  return JSON.parse(raw);
}

function stripParens(s) {
  if (typeof s !== "string") return s;
  return s.replace(/^\s*\(?\s*|\s*\)?\s*$/g, "").trim();
}

/** Заполнить stringIdToRu из формата descriptors (stat_descriptions / passive_skill_*) */
function fillFromDescriptors(obj, stringIdToRu) {
  if (!obj || !Array.isArray(obj.descriptors)) return;
  for (const d of obj.descriptors) {
    const ids = d.ids;
    const first = d.list && d.list[0] && d.list[0].string;
    if (!first || !Array.isArray(ids)) continue;
    for (const id of ids) {
      if (id && typeof id === "string" && !stringIdToRu.has(id)) {
        stringIdToRu.set(id, first);
      }
    }
  }
}

/** Заполнить stringIdToRu и при наличии Russian[1] — stringIdToRuReduced (вариант "reduced"). */
function fillStatDescriptionsFromTranslations(arr, stringIdToRu, stringIdToRuReduced) {
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    const ids = item.ids;
    const ru = item.Russian;
    const first =
      Array.isArray(ru) && ru[0] && ru[0].string ? ru[0].string : null;
    if (!first || !Array.isArray(ids)) continue;
    // плейсхолдеры {0} или многострочные описания (кистоуны с \n) — не короткие названия нод
    if (!first.includes("{") && !first.includes("\n")) continue;
    const reminder = Array.isArray(ru) && ru[0] && ru[0].reminder_text ? ru[0].reminder_text : null;
    // для статов с плейсхолдером {0} нужен string (шаблон для подстановки значения), а не reminder_text
    const value =
      /\{\d+\}/.test(first)
        ? first
        : reminder && stripParens(reminder).length > first.length
          ? stripParens(reminder)
          : first;
    for (const id of ids) {
      if (id && typeof id === "string") {
        const cur = stringIdToRu.get(id);
        const preferMultiLine = value.includes("\n") && (!cur || !cur.includes("\n"));
        if (!cur || value.length > cur.length || preferMultiLine) stringIdToRu.set(id, value);
      }
    }
    if (stringIdToRuReduced && Array.isArray(ru) && ru[1] && ru[1].string) {
      const second = ru[1].string;
      const rem1 = ru[1].reminder_text;
      const valReduced =
        /\{\d+\}/.test(second)
          ? second
          : rem1 && stripParens(rem1).length > second.length
            ? stripParens(rem1)
            : second;
      for (const id of ids) {
        if (id && typeof id === "string") {
          const cur = stringIdToRuReduced.get(id);
          if (!cur || valReduced.length > cur.length) stringIdToRuReduced.set(id, valReduced);
        }
      }
    }
  }
}

/** Заполнить stringIdToRu и при наличии Russian[1] — stringIdToRuReduced. */
function fillFromRepoeRu(arr, stringIdToRu, stringIdToRuReduced) {
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    const ids = item.ids;
    const ru = item.Russian;
    const first =
      Array.isArray(ru) && ru[0] && ru[0].string ? ru[0].string : null;
    if (!first || !Array.isArray(ids)) continue;
    const reminder = Array.isArray(ru) && ru[0] && ru[0].reminder_text ? ru[0].reminder_text : null;
    const value =
      /\{\d+\}/.test(first)
        ? first
        : reminder && stripParens(reminder).length > first.length
          ? stripParens(reminder)
          : first;
    for (const id of ids) {
      if (id && typeof id === "string") {
        if (id === "local_physical_damage_+%" && /Не наносит физический урон/i.test(value)) continue;
        const cur = stringIdToRu.get(id);
        if (!cur || value.length > cur.length) stringIdToRu.set(id, value);
      }
    }
    if (stringIdToRuReduced && Array.isArray(ru) && ru[1] && ru[1].string) {
      const second = ru[1].string;
      const rem1 = ru[1].reminder_text;
      const valReduced =
        /\{\d+\}/.test(second)
          ? second
          : rem1 && stripParens(rem1).length > second.length
            ? stripParens(rem1)
            : second;
      for (const id of ids) {
        if (id && typeof id === "string") {
          if (id === "local_physical_damage_+%" && /Не наносит физический урон/i.test(valReduced)) continue;
          const cur = stringIdToRuReduced.get(id);
          if (!cur || valReduced.length > cur.length) stringIdToRuReduced.set(id, valReduced);
        }
      }
    }
  }
}

/** Заполнить stringIdToRu и при наличии Russian[1] — stringIdToRuReduced. */
function fillFromAdvancedMod(arr, stringIdToRu, stringIdToRuReduced) {
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    const ids = item.ids;
    const ru = item.Russian;
    const first =
      Array.isArray(ru) && ru[0] && ru[0].string ? ru[0].string : null;
    if (!first || !Array.isArray(ids)) continue;
    const reminder = Array.isArray(ru) && ru[0] && ru[0].reminder_text ? ru[0].reminder_text : null;
    const value =
      /\{\d+\}/.test(first)
        ? first
        : reminder && stripParens(reminder).length > first.length
          ? stripParens(reminder)
          : first;
    for (const id of ids) {
      if (id && typeof id === "string") {
        if (id === "local_physical_damage_+%" && /Не наносит физический урон/i.test(value)) continue;
        const cur = stringIdToRu.get(id);
        if (!cur || value.length > cur.length) stringIdToRu.set(id, value);
      }
    }
    if (stringIdToRuReduced && Array.isArray(ru) && ru[1] && ru[1].string) {
      const second = ru[1].string;
      const rem1 = ru[1].reminder_text;
      const valReduced =
        /\{\d+\}/.test(second)
          ? second
          : rem1 && stripParens(rem1).length > second.length
            ? stripParens(rem1)
            : second;
      for (const id of ids) {
        if (id && typeof id === "string") {
          if (id === "local_physical_damage_+%" && /Не наносит физический урон/i.test(valReduced)) continue;
          const cur = stringIdToRuReduced.get(id);
          if (!cur || valReduced.length > cur.length) stringIdToRuReduced.set(id, valReduced);
        }
      }
    }
  }
}

/** Рекурсивно собрать из объекта все пары "числовая_строка" → "строка" в out (для passiveSkillGraphIdToNameRu). */
function fillPassiveGraphIdFromObject(obj, out) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) fillPassiveGraphIdFromObject(item, out);
    return;
  }
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string" && val.length > 0) {
      const id = parseInt(key, 10);
      if (key === String(id) && !Number.isNaN(id) && id >= 0) out[id] = val;
    } else if (val && typeof val === "object") {
      fillPassiveGraphIdFromObject(val, out);
    }
  }
}

/**
 * Только по id. ru — массив, для каждой записи: id → русский (строка без "{0}").
 */
function fillPassiveNamesFromStatTranslations(ruArr, idToRuOut) {
  if (!Array.isArray(ruArr)) return;
  for (const item of ruArr) {
    const id = Array.isArray(item.ids) && item.ids[0] ? item.ids[0] : null;
    const ru = Array.isArray(item.Russian) && item.Russian[0] && item.Russian[0].string ? item.Russian[0].string : null;
    if (!id || !ru || ru.includes("{")) continue;
    idToRuOut[id] = ru;
  }
}

function escapeStr(v) {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"');
}

function escapeKey(k) {
  return String(k)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"');
}

/** Плейсхолдеры {0}, {1:0.1} и т.д. → __, затем оставшиеся числа → __ (чтобы совпадало с displayStringToSkeleton). */
function templateToSkeleton(template) {
  return String(template)
    .replace(/\{\d+(?::[^}]*)?\}/g, "__")
    .replace(/\d+(?:\.\d+)?/g, "__");
}

/** stat_translations (en): English[].string и English[].reminder_text (без скобок) → skeleton → массив id. */
function addSkeletonFromString(skeleton, id, map) {
  if (!skeleton || !id) return;
  if (!map[skeleton]) map[skeleton] = [];
  if (!map[skeleton].includes(id)) map[skeleton].push(id);
}

function buildSkeletonToId(statTranslationsEn) {
  const map = {};
  if (!Array.isArray(statTranslationsEn)) return map;
  for (const item of statTranslationsEn) {
    const ids = item.ids;
    const en = item.English;
    if (!Array.isArray(ids) || ids.length === 0) continue;
    const id = ids[0];
    if (!id || typeof id !== "string") continue;
    if (!Array.isArray(en)) continue;
    for (const variant of en) {
      const str = variant && variant.string;
      if (str) {
        const skeleton = templateToSkeleton(str);
        addSkeletonFromString(skeleton, id, map);
      }
      const reminder = variant && variant.reminder_text;
      if (reminder) {
        const text = stripParens(reminder);
        const skeleton = templateToSkeleton(text);
        addSkeletonFromString(skeleton, id, map);
      }
    }
  }
  return map;
}

/** Объединить массивы id по скелетонам (без дубликатов). */
function mergeSkeletonToIdArrays(target, source) {
  for (const [skeleton, ids] of Object.entries(source)) {
    if (!target[skeleton]) target[skeleton] = [];
    for (const id of ids) {
      if (!target[skeleton].includes(id)) target[skeleton].push(id);
    }
  }
}

/** Выбрать по одному id на скелетон: приоритет у id, для которых есть перевод в stringIdToRu. */
function resolveSkeletonToId(skeletonToIdArrays, stringIdToRu) {
  const resolved = {};
  for (const [skeleton, ids] of Object.entries(skeletonToIdArrays)) {
    const withRu = ids.find((id) => stringIdToRu.has(id));
    resolved[skeleton] = withRu ?? ids[0];
  }
  return resolved;
}

/** id → английский шаблон (для отображения стата, когда WASM не даёт Text). */
function fillStringIdToEnTemplate(arr, out) {
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    const ids = item.ids;
    const en = item.English;
    if (!Array.isArray(ids) || !Array.isArray(en) || en.length === 0) continue;
    let template = en[0]?.string;
    for (const v of en) {
      if (v?.string?.includes("{0}")) {
        template = v.string;
        break;
      }
    }
    if (!template) continue;
    for (const id of ids) {
      if (id && typeof id === "string" && !out[id]) out[id] = template;
    }
  }
}

function main() {
  const stringIdToRu = new Map();
  const stringIdToRuReduced = new Map();

  // 1) Descriptors (опционально) — из temp/en
  const descFiles = [
    "stat_descriptions.json",
    "passive_skill_stat_descriptions.json",
    "passive_skill_aura_stat_descriptions.json",
  ];
  for (const name of descFiles) {
    const p = join(TEMP_EN, name);
    if (existsSync(p)) fillFromDescriptors(loadJson(p), stringIdToRu);
  }

  // 2) Repoe Russian (опционально) — из temp/ru
  const repoePath = join(TEMP_RU, "stat_translations_repoe_ru.json");
  if (existsSync(repoePath)) fillFromRepoeRu(loadJson(repoePath), stringIdToRu, stringIdToRuReduced);

  // 3) advanced_mod.json (RePoE stat_translations: ids[] + Russian[].string)
  const advancedModPath = join(TEMP_RU, "advanced_mod.json");
  if (existsSync(advancedModPath)) {
    fillFromAdvancedMod(loadJson(advancedModPath), stringIdToRu, stringIdToRuReduced);
  }

  // 4) Названия нод только по id (id → русский). stat_translations — id→RU статов (с приоритетом длинного reminder_text).
  const passiveNamesRuById = {};
  const statIdByRuName = {}; // русское короткое название ("Акробатика") → stat id (keystone_acrobatics), для fallback по кистоунам
  const statTranslationsRuPath = join(TEMP_RU, "stat_translations.json");
  if (existsSync(statTranslationsRuPath)) {
    const statTranslationsRu = loadJson(statTranslationsRuPath);
    fillPassiveNamesFromStatTranslations(statTranslationsRu, passiveNamesRuById);
    for (const item of statTranslationsRu || []) {
      const id = Array.isArray(item.ids) && item.ids[0] ? item.ids[0] : null;
      const ru = Array.isArray(item.Russian) && item.Russian[0] && item.Russian[0].string ? item.Russian[0].string : null;
      if (!id || !ru || ru.includes("{")) continue;
      statIdByRuName[ru] = id;
    }
    fillFromRepoeRu(statTranslationsRu, stringIdToRu, stringIdToRuReduced);
  }

  // 4b) passive_skill.json — после stat_translations, чтобы варианты с \n (кистоуны, многострочные) не затирались одной строкой.
  const passiveSkillRuPath = join(TEMP_RU, "passive_skill.json");
  if (existsSync(passiveSkillRuPath)) {
    fillStatDescriptionsFromTranslations(loadJson(passiveSkillRuPath), stringIdToRu, stringIdToRuReduced);
  }
  // Исправление: в данных одна запись с ids [local_physical_damage_+%, local_weapon_no_physical_damage] содержит только «Не наносит физический урон»; для local_physical_damage_+% нужен шаблон увеличения урона.
  const curLocalPhys = stringIdToRu.get("local_physical_damage_+%");
  if (!curLocalPhys || /Не наносит физический урон/i.test(curLocalPhys)) {
    stringIdToRu.set("local_physical_damage_+%", "{0}% увеличение физического урона");
  }
  // Ручные дополнения: только по id (ключ с подчёркиванием считаем id)
  const keystonePath = join(TEMP_RU, "keystone_names_ru.json");
  if (existsSync(keystonePath)) {
    const raw = loadJson(keystonePath);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [key, val] of Object.entries(raw)) {
        if (!key || typeof val !== "string") continue;
        if (key.includes("_")) passiveNamesRuById[key] = val;
      }
    }
  }
  // Альтернативные пассивы (timeless jewels): Id → RU с PoEDB; файл только создаётся fetch-скриптом, не перезаписывается здесь
  const alternatePoedbPath = join(TEMP_RU, "alternate_passive_names_poedb_ru.json");
  if (existsSync(alternatePoedbPath)) {
    const poedbRu = loadJson(alternatePoedbPath);
    if (poedbRu && typeof poedbRu === "object") {
      for (const [key, val] of Object.entries(poedbRu)) {
        if (key && typeof val === "string") passiveNamesRuById[key] = val;
      }
    }
  }

  // 6) Названия по PassiveSkillGraphID: приоритет — passive_node_ru.json (с оф. сайта), затем passive_skill_names_ru.json + stat_value_handlers.json
  const passiveSkillGraphIdToNameRu = {};
  const passiveNodeRuPath = join(TEMP_RU, "passive_node_ru.json");
  if (existsSync(passiveNodeRuPath)) {
    const raw = loadJson(passiveNodeRuPath);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [key, val] of Object.entries(raw)) {
        const id = parseInt(key, 10);
        if (!Number.isNaN(id) && val && typeof val === "object" && typeof val.name === "string") {
          passiveSkillGraphIdToNameRu[id] = val.name;
        }
      }
    }
  }
  const passiveNamesPath = join(TEMP_RU, "passive_skill_names_ru.json");
  if (existsSync(passiveNamesPath)) {
    const raw = loadJson(passiveNamesPath);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [key, val] of Object.entries(raw)) {
        const id = parseInt(key, 10);
        if (!Number.isNaN(id) && typeof val === "string" && !passiveSkillGraphIdToNameRu[id]) {
          passiveSkillGraphIdToNameRu[id] = val;
        }
      }
    }
  }
  const statValueHandlersPath = join(TEMP_RU, "stat_value_handlers.json");
  if (existsSync(statValueHandlersPath)) {
    fillPassiveGraphIdFromObject(loadJson(statValueHandlersPath), passiveSkillGraphIdToNameRu);
  }

  // 6b) skeleton → [id, ...] для обратного поиска по строке. Один скелетон может соответствовать разным id (напр. base_movement_velocity_+% и from_armour_movement_speed_+%).
  const skeletonToIdArrays = {};
  const stringIdToEnTemplate = {};
  for (const path of [
    join(TEMP_EN, "stat_translations.json"),
    join(TEMP_EN, "stat_translations.json.gz"),
  ]) {
    if (existsSync(path)) {
      const enArr = loadJson(path);
      mergeSkeletonToIdArrays(skeletonToIdArrays, buildSkeletonToId(enArr));
      fillStringIdToEnTemplate(enArr, stringIdToEnTemplate);
      break;
    }
  }
  const passiveSkillEnPath = join(PUBLIC_DATA, "stat_translations", "passive_skill.json");
  if (existsSync(passiveSkillEnPath)) {
    const passiveEn = loadJson(passiveSkillEnPath);
    mergeSkeletonToIdArrays(skeletonToIdArrays, buildSkeletonToId(passiveEn));
    fillStringIdToEnTemplate(passiveEn, stringIdToEnTemplate);
  }
  // Выбираем по одному id на скелетон: приоритет у id, для которых есть перевод (пассивное дерево и т.д.).
  const skeletonToId = resolveSkeletonToId(skeletonToIdArrays, stringIdToRu);

  const countStringId = stringIdToRu.size;
  const countPassiveNamesById = Object.keys(passiveNamesRuById).length;
  const countPassiveByGraphId = Object.keys(passiveSkillGraphIdToNameRu).length;
  const countSkeleton = Object.keys(skeletonToId).length;

  const header = "// Auto-generated by scripts/build-stat-dict.mjs — do not edit by hand.\n";

  writeFileSync(
    join(OUT_DIR, "statStringToId.generated.ts"),
    header +
      "/** skeleton (числа заменены на __) → stat id. Поиск по строке без индексов. */\n" +
      "export const statStringToIdGenerated: Record<string, string> = {\n" +
      Object.entries(skeletonToId)
        .filter(([, id]) => id)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `  "${escapeKey(k)}": "${escapeKey(v)}",`)
        .join("\n") +
      "\n};\n",
    "utf8",
  );

  writeFileSync(
    join(OUT_DIR, "statNamesByStringId.generated.ts"),
    header +
      "export const statNamesRuByStringIdGenerated: Record<string, string> = {\n" +
      Object.entries(Object.fromEntries(stringIdToRu))
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `  "${escapeKey(k)}": "${escapeStr(v)}",`)
        .join("\n") +
      "\n};\n",
    "utf8",
  );

  const reducedEntries = Object.entries(Object.fromEntries(stringIdToRuReduced));
  writeFileSync(
    join(OUT_DIR, "statNamesRuReducedByStringId.generated.ts"),
    header +
      "/** Вариант «reduced» / «less» для статов с двумя формулировками (id → русский шаблон). */\n" +
      "export const statNamesRuReducedByStringIdGenerated: Record<string, string> = {\n" +
      reducedEntries
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `  "${escapeKey(k)}": "${escapeStr(v)}",`)
        .join("\n") +
      "\n};\n",
    "utf8",
  );

  writeFileSync(
    join(OUT_DIR, "passiveNamesById.generated.ts"),
    header +
      "export const passiveNamesRuByIdGenerated: Record<string, string> = {\n" +
      Object.entries(passiveNamesRuById)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `  "${escapeKey(k)}": "${escapeStr(v)}",`)
        .join("\n") +
      "\n};\n",
    "utf8",
  );

  writeFileSync(
    join(OUT_DIR, "passiveSkillGraphIdToNameRu.generated.ts"),
    header +
      "export const passiveSkillGraphIdToNameRuGenerated: Record<number, string> = {\n" +
      Object.entries(passiveSkillGraphIdToNameRu)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([k, v]) => `  ${k}: "${escapeStr(v)}",`)
        .join("\n") +
      "\n};\n",
    "utf8",
  );

  const countStatIdByRuName = Object.keys(statIdByRuName).length;
  writeFileSync(
    join(OUT_DIR, "statIdByRuName.generated.ts"),
    header +
      "/** Русское короткое название ноды (например «Акробатика») → stat id (keystone_acrobatics). Fallback, когда по тексту id не находится. */\n" +
      "export const statIdByRuNameGenerated: Record<string, string> = {\n" +
      Object.entries(statIdByRuName)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `  "${escapeKey(k)}": "${escapeKey(v)}",`)
        .join("\n") +
      "\n};\n",
    "utf8",
  );

  const countEnTemplates = Object.keys(stringIdToEnTemplate).length;
  writeFileSync(
    join(OUT_DIR, "statTemplatesEnByStringId.generated.ts"),
    header +
      "/** id → английский шаблон стата (для тултипа, когда WASM не даёт Text). */\n" +
      "export const statTemplatesEnByStringIdGenerated: Record<string, string> = {\n" +
      Object.entries(stringIdToEnTemplate)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `  "${escapeKey(k)}": "${escapeStr(v)}",`)
        .join("\n") +
      "\n};\n",
    "utf8",
  );

  const barrel = [
    "// Auto-generated by scripts/build-stat-dict.mjs — do not edit by hand.",
    "// Re-exports from split generated files. Статы только по строковому id.",
    "",
    "export { statNamesRuByStringIdGenerated } from \"./statNamesByStringId.generated\";",
    "export { statNamesRuReducedByStringIdGenerated } from \"./statNamesRuReducedByStringId.generated\";",
    "export { statStringToIdGenerated } from \"./statStringToId.generated\";",
    "export { passiveNamesRuByIdGenerated } from \"./passiveNamesById.generated\";",
    "export { passiveSkillGraphIdToNameRuGenerated } from \"./passiveSkillGraphIdToNameRu.generated\";",
    "export { statIdByRuNameGenerated } from \"./statIdByRuName.generated\";",
    "export { statTemplatesEnByStringIdGenerated } from \"./statTemplatesEnByStringId.generated\";",
    "",
  ].join("\n");

  writeFileSync(OUT_FILE, barrel + "\n", "utf8");

  const countReduced = stringIdToRuReduced.size;
  console.log(
    `Wrote ${countStringId} stat by string id + ${countReduced} reduced + ${countSkeleton} skeleton→id + ${countPassiveNamesById} names by id + ${countStatIdByRuName} ruName→id + ${countPassiveByGraphId} by graph id + ${countEnTemplates} en templates → 7 files + barrel ${OUT_FILE}`,
  );
}

main();
