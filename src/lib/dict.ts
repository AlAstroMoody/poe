/**
 * Словарь русских названий. Ключи — значения с бэка (англ.), значения — отображаемый текст.
 * При отсутствии перевода показываем оригинал.
 *
 * Переводы статов генерируются скриптом: npm run build:dict (из корня frontend-vue)
 * Лёгкий словарь нод RU: npm run fetch:passive-tree-ru → src/temp/ru/passive_node_ru.json
 */

import passiveNodeRuJson from "@/temp/ru/passive_node_ru.json";
import {
  statNamesRuByStringIdGenerated,
  statNamesRuReducedByStringIdGenerated,
  statStringToIdGenerated,
  passiveNamesRuByIdGenerated,
  passiveSkillGraphIdToNameRuGenerated,
  statIdByRuNameGenerated,
  statTemplatesEnByStringIdGenerated,
} from "./statNamesRu.generated";

/** Самоцветы: id → русское название (официальная локализация игры) */
export const jewelNamesRu: Record<number, string> = {
  1: "Блистательное тщеславие", // Glorious Vanity
  2: "Смертельная гордость", // Lethal Pride
  3: "Жестокая сдержанность", // Brutal Restraint
  4: "Воинственная вера", // Militant Faith
  5: "Изящный эгоизм", // Elegant Hubris
  6: "Трагедия героев", // Heroic Tragedy
};

/** Завоеватели: английское имя → русское название (официальная локализация игры) */
export const conquerorNamesRu: Record<string, string> = {
  // Блистательное тщеславие (Glorious Vanity)
  Ahuana: "Ахвана",
  Doryani: "Дориани",
  Xibaqua: "Шибаква",
  Zerphi: "Зерфи",
  // Воинственная вера (Militant Faith)
  Avarius: "Аварий",
  Venarius: "Венерий",
  Maxarius: "Макерий",
  Dominus: "Владыка",
  // Жестокая сдержанность (Brutal Restraint)
  Asenath: "Азенат",
  Balbala: "Балбала",
  Nasima: "Насима (Назима)",
  Deshret: "Дешрет",
  // Изящный эгоизм (Elegant Hubris)
  Cadiro: "Кадиро",
  Victario: "Виктарио",
  Caspiro: "Каспиро",
  Chitus: "Титус",
  // Смертельная гордость (Lethal Pride)
  Kaom: "Каом",
  Rakiata: "Ракиата",
  Akoya: "Акойя",
  Kiloava: "Килоава",
  // Heroic Tragedy (Kalguuran)
  "Celestial Mathematics": "Утред",
  "The Unbreaking Circle": "Медведь",
  "Black Scythe Training": "Ворана",
};

/** Получить отображаемое название самоцвета (по id и английскому label с бэка) */
export function jewelLabel(
  id: number,
  enLabel: string,
  lang: "ru" | "en",
): string {
  if (lang === "ru" && jewelNamesRu[id]) return jewelNamesRu[id];
  return enLabel;
}

/** Получить отображаемое имя завоевателя */
export function conquerorLabel(enName: string, lang: "ru" | "en"): string {
  if (lang === "ru" && conquerorNamesRu[enName])
    return conquerorNamesRu[enName];
  return enName;
}

/** Статы по строковому id: id → русский шаблон с плейсхолдерами {0}, {1}. Генерация: scripts/build-stat-dict.mjs. */
export const statNamesRuByStringId: Record<string, string> = {
  ...statNamesRuByStringIdGenerated,
};

/** skeleton (числа → __) → stat id. Для поиска по отображаемой строке без индексов. */
export const statStringToId: Record<string, string> = {
  ...statStringToIdGenerated,
};

/** Вариант «reduced»/«less»: id → русский шаблон (для статов с двумя формулировками). */
export const statNamesRuReducedByStringId: Record<string, string> = {
  ...statNamesRuReducedByStringIdGenerated,
};

const NUM_RE = /[+-]?\d+(?:\.\d+)?/g;

/** Строку типа "30% increased maximum Mana" → skeleton "__% increased maximum Mana". */
export function displayStringToSkeleton(s: string): string {
  return s.replace(NUM_RE, "__");
}

/** Из строки "30% increased maximum Mana" извлечь числа [30]. */
export function extractRollsFromDisplayString(s: string): number[] {
  const m = s.match(NUM_RE);
  return m ? m.map((x) => parseFloat(x)) : [];
}

/** По отображаемой строке (из node.stats) найти stat id и перевести на русский. Для "reduced"/"less" используем вариант reduced. */
export function translateStatByDisplayString(
  displayString: string,
  lang: "ru" | "en",
): string {
  if (lang !== "ru") return displayString;
  const skeleton = displayStringToSkeleton(displayString);
  const statId = statStringToId[skeleton];
  if (!statId) return displayString;
  const isReduced = /reduced|less\s/i.test(displayString);
  const template =
    (isReduced && statNamesRuReducedByStringId[statId]) ||
    statNamesRuByStringId[statId];
  if (!template) return displayString;
  const rolls = extractRollsFromDisplayString(displayString);
  return formatStatTemplate(template, rolls);
}

/** По массиву отображаемых строк (одна нода — один стат в несколько строк) найти stat id. Сначала пробуем полный текст (join \n и ". "). Ключ — как в stat_translations (ids). */
export function getStatIdFromDisplayLines(lines: string[]): string | null {
  if (!lines?.length) return null;
  const fullWithNewline = lines.join("\n");
  const fullWithPeriod = lines.join(". ");
  for (const full of [fullWithNewline, fullWithPeriod]) {
    const skeleton = displayStringToSkeleton(full);
    const id = statStringToId[skeleton];
    if (id) return id;
  }
  return null;
}

/** Один стат по id: текст для тултипа (RU или EN), числа подставляются из всех строк. */
export function getStatTextById(
  statId: string,
  lang: "ru" | "en",
  rollsFromLines: number[],
): string {
  const rolls = rollsFromLines.length ? rollsFromLines : [];
  if (lang === "ru") {
    const template = statNamesRuByStringId[statId];
    return template ? formatStatTemplate(template, rolls) : statId;
  }
  const template = statTemplatesEnByStringId[statId];
  return template ? formatStatTemplate(template, rolls) : statId;
}

/** Названия нод только по id (id → русский). */
export const passiveNamesRuById: Record<string, string> = {
  ...passiveNamesRuByIdGenerated,
};

/** Названия по PassiveSkillGraphID (числовой id), если есть файл в temp/ru. */
export const passiveSkillGraphIdToNameRu: Record<number, string> = {
  ...passiveSkillGraphIdToNameRuGenerated,
};

/** Лёгкий словарь с оф. сайта: skillId → { name, stats } для перевода тултипов RU. Ключи в JSON — строки. */
export const passiveNodeRu: Record<string, { name: string; stats: string[] }> =
  passiveNodeRuJson as Record<string, { name: string; stats: string[] }>;

/** Русское короткое название ноды («Акробатика») → stat id (keystone_acrobatics). Fallback, когда по тексту id не находится. */
export const statIdByRuName: Record<string, string> = {
  ...statIdByRuNameGenerated,
};

/** id → английский шаблон стата (для тултипа альтернативных нод, когда WASM не даёт Text). */
export const statTemplatesEnByStringId: Record<string, string> = {
  ...statTemplatesEnByStringIdGenerated,
};

/**
 * Строка тултипа RU для стата из WASM: словарь по id, затем по скелетону англ. текста из stats.json,
 * с учётом варианта reduced/less (как translateStatByDisplayString).
 */
export function formatRuStatLineFromWasm(
  wasmStatId: string,
  wasmEnText: string,
  rollValues: number[],
): string | undefined {
  let template =
    statNamesRuByStringId[wasmStatId] ||
    statNamesRuReducedByStringId[wasmStatId];
  if (!template && wasmEnText) {
    const isReduced = /reduced|less\s/i.test(wasmEnText);
    const skeleton = displayStringToSkeleton(wasmEnText);
    const mappedId = statStringToId[skeleton];
    if (mappedId) {
      template =
        (isReduced && statNamesRuReducedByStringId[mappedId]) ||
        statNamesRuByStringId[mappedId];
    }
  }
  if (!template) return undefined;
  return formatStatTemplate(template, rollValues);
}

/** Отображаемое название стата по строковому id (единственный способ — только по id). */
export function statLabelByStringId(
  stringId: string,
  enLabel: string,
  lang: "ru" | "en",
): string {
  if (lang === "ru") {
    let template = statNamesRuByStringId[stringId];
    if (template) {
      return formatStatTemplate(template, []);
    }
    // Fallback: WASM может отдавать другой Id — ищем по английскому тексту (skeleton)
    if (enLabel && typeof enLabel === "string") {
      const skeleton = displayStringToSkeleton(enLabel);
      const idBySkeleton = statStringToId[skeleton];
      if (idBySkeleton) {
        template = statNamesRuByStringId[idBySkeleton];
        if (template) return formatStatTemplate(template, []);
      }
    }
  } else {
    // Для английского языка тоже используем шаблоны
    let template = statTemplatesEnByStringId[stringId];
    if (template) {
      return formatStatTemplate(template, []);
    }
  }
  return enLabel;
}

/** Подставить значения в шаблон стата (например "{0}% увеличение" + [5] → "5% увеличение"). */
export function formatStatTemplate(
  template: string,
  rolls: (number | undefined)[],
): string {
  return template.replace(/\{(\d+)\}/g, (_, n) =>
    String(rolls[Number(n)] ?? "#"),
  );
}

/** Нормализация имени для поиска в словаре (отображаемое имя → internal id: апостроф убрать, пробелы в _, нижний регистр). */
function normalizePassiveNameForLookup(name: string): string {
  return name.replace(/'/g, "").replace(/\s+/g, "_").toLowerCase();
}

/** Отображаемое название кистоуна/пассива по id (только по id). Для альтернативных нод от самоцвета имя может приходить как "Axiom Warden" — пробуем и нормализованный ключ. */
export function keystoneLabel(
  stringId: string,
  enLabel: string,
  lang: "ru" | "en",
): string {
  if (lang !== "ru") return enLabel;
  return (
    passiveNamesRuById[stringId] ??
    passiveNamesRuById[normalizePassiveNameForLookup(stringId)] ??
    enLabel
  );
}

/**
 * Описание самоцвета «как в игре»: подставляются диапазон (от min до max) и имя завоевателя.
 * jewelId 1–6, conqueror — английское имя с бэка.
 */
const jewelFlavorRu: Record<number, string> = {
  1: "Омыт в крови от {min} до {max} жертв во имя {conqueror}. Пассивные умения в радиусе завоеваны ваал.",
  2: "Повелевает от {min} до {max} воинами {conqueror}. Пассивные умения в радиусе завоеваны каруи.",
  3: "Символизирует служение от {min} до {max} дехара в ахаре {conqueror}. Пассивные умения в радиусе завоеваны маракетами.",
  4: "Выточен во славу от {min} до {max} послушников, обращённых Верховным жрецом {conqueror}. Пассивные умения в радиусе завоеваны храмовниками.",
  5: "Выделено от {min} до {max} монет в память о {conqueror}. Пассивные умения в радиусе завоеваны Вечной империей.",
  6: "Вспоминая о {min}–{max} славных деяниях рода {conqueror}. Пассивные умения в радиусе завоеваны калгуурами.",
};

export function getJewelFlavorText(
  jewelId: number,
  min: number,
  max: number,
  conquerorEn: string,
  lang: "ru" | "en",
): string {
  if (lang !== "ru" || !jewelFlavorRu[jewelId]) {
    return "";
  }
  const template = jewelFlavorRu[jewelId];
  const conqueror = conquerorLabel(conquerorEn, "ru");
  return template
    .replace("{min}", String(min))
    .replace("{max}", String(max))
    .replace("{conqueror}", conqueror);
}

/** То же описание по предложениям — для вывода с переносами строк (без v-html) */
export function getJewelFlavorLines(
  jewelId: number,
  min: number,
  max: number,
  conquerorEn: string,
  lang: "ru" | "en",
): string[] {
  const text = getJewelFlavorText(jewelId, min, max, conquerorEn, lang);
  if (!text) return [];
  return text
    .split(". ")
    .filter(Boolean)
    .map((s, i, arr) => (i < arr.length - 1 ? s + "." : s));
}

/** Подписи интерфейса меню */
export const uiEn = {
  jewel: "Jewel",
  conqueror: "Conqueror",
  title: "Timeless Jewel",
  results: "Results",
  config: "Config",
  enterSeed: "Enter Seed",
  selectStats: "Select Stats",
  seed: "Seed",
  sortOrder: "Sort Order",
  sortCount: "Count",
  sortAlphabet: "Alphabetical",
  sortRarity: "Rarity",
  sortValue: "Value",
  colors: "Colors",
  split: "Split",
  clickJewelSocket: "Click on a jewel socket",
  clickToSelectSocket: "Click to select this socket",
  seedBetween: "Seed must be between",
  and: "and",
  addStat: "Add Stat",
  min: "Min",
  weight: "Weight",
  minTotalWeight: "Min Total Weight",
  selectAll: "Select All",
  notables: "Notables",
  passives: "Passives",
  deselect: "Deselect",
  search: "Search",
  trade: "Trade",
  grouped: "Grouped",
  notablesTitle: "Notables",
  smallsTitle: "Smalls",
  selectPlaceholder: "-- Select --",
  filterStatList: "Search in list…",
  noResults: "No results found",
  customFont: "Custom font",
} as const;

export const uiRu: Record<keyof typeof uiEn, string> = {
  jewel: "Самоцвет",
  conqueror: "Завоеватель",
  title: "Вневременные самоцветы",
  results: "Результаты",
  config: "Настройки",
  enterSeed: "Ввести номер",
  selectStats: "Выбрать параметры",
  seed: "Номер",
  sortOrder: "Порядок сортировки",
  sortCount: "Количество",
  sortAlphabet: "По алфавиту",
  sortRarity: "Редкость",
  sortValue: "Значение",
  colors: "Цвета",
  split: "Раздельно",
  clickJewelSocket: "Выберите сокет для самоцвета",
  clickToSelectSocket: "Нажмите, чтобы выбрать этот сокет",
  seedBetween: "Номер должен быть от",
  and: "до",
  addStat: "Добавить параметр",
  min: "Мин",
  weight: "Вес",
  minTotalWeight: "Мин. сумма весов",
  selectAll: "Выбрать все ноды",
  notables: "Большие",
  passives: "Мелкие",
  deselect: "Снять выбор",
  search: "Поиск",
  trade: "Обмен",
  grouped: "Группировать",
  notablesTitle: "Ноды",
  smallsTitle: "Малые",
  selectPlaceholder: "— Выберите —",
  filterStatList: "Поиск в списке…",
  noResults: "Совпадений нет",
  customFont: "Кастомный шрифт",
};

export function ui(key: keyof typeof uiEn, lang: "ru" | "en"): string {
  return lang === "ru" ? uiRu[key] : uiEn[key];
}
