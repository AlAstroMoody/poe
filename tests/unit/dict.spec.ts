import { beforeAll, describe, expect, it } from "vitest";
import {
  conquerorLabel,
  countStatTemplateSlots,
  displayStringToSkeleton,
  ensureEnDictMaps,
  extractRollsFromDisplayString,
  formatStatTemplate,
  getJewelFlavorLines,
  getJewelFlavorText,
  getStatIdFromDisplayLines,
  groupEntriesByStatTemplate,
  jewelLabel,
  statNamesRuByStringId,
  statStringToId,
  statTemplatesEnByStringId,
  stripStatDescriptionMarkup,
  translateStatByDisplayString,
  ui,
} from "@/lib/dict";
import golden from "../fixtures/tooltip-golden.json";

// EN-шаблоны и skeleton→id подгружаются лениво (тот же чанк, что в приложении).
beforeAll(async () => {
  await ensureEnDictMaps();
});

describe("displayStringToSkeleton", () => {
  it("заменяет числа на __", () => {
    expect(displayStringToSkeleton("30% increased maximum Mana")).toBe(
      "__% increased maximum Mana",
    );
  });

  it("сохраняет литеральный знак (как ключи словаря)", () => {
    expect(displayStringToSkeleton("-10 to Strength")).toBe("-__ to Strength");
    expect(displayStringToSkeleton("+12 to Strength")).toBe("+__ to Strength");
  });

  it("понимает десятичные дроби", () => {
    expect(displayStringToSkeleton("+1.5% to Critical Strike Chance")).toBe(
      "+__% to Critical Strike Chance",
    );
  });
});

describe("extractRollsFromDisplayString", () => {
  it("достаёт несколько чисел (min/max)", () => {
    expect(extractRollsFromDisplayString("Adds 12 to 24 Fire Damage to Attacks")).toEqual([
      12, 24,
    ]);
  });

  it("возвращает пустой массив, если чисел нет", () => {
    expect(extractRollsFromDisplayString("no numbers here")).toEqual([]);
  });
});

describe("countStatTemplateSlots", () => {
  it("считает max-индекс + 1 и понимает формат-спеку", () => {
    expect(countStatTemplateSlots("Добавляет от {0} до {1} урона")).toBe(2);
    expect(countStatTemplateSlots("{0:+d} к набожности")).toBe(1);
    expect(countStatTemplateSlots("без слотов")).toBe(0);
  });
});

describe("formatStatTemplate", () => {
  it("подставляет значения по слотам", () => {
    expect(formatStatTemplate("Добавляет от {0} до {1} урона", [12, 24])).toBe(
      "Добавляет от 12 до 24 урона",
    );
  });

  it("недостающий слот → #", () => {
    expect(formatStatTemplate("{0} do {1}", [12])).toBe("12 do #");
  });

  it("убирает GGG-разметку [DNT] и [ID|text]", () => {
    expect(formatStatTemplate("[DNT] [DirectFlight|дальность]", [])).toBe(
      "дальность",
    );
  });

  it("NB: формат-спека {0:+d} сейчас игнорируется — подставляется сырое число", () => {
    // Фиксируем текущее поведение. Если появится форматирование знака — обновить.
    expect(formatStatTemplate("{0:+d} к набожности", [10])).toBe("10 к набожности");
  });
});

describe("groupEntriesByStatTemplate", () => {
  const tpl = "Добавляет от {0} до {1} урона от огня к атакам";
  const other = "{0}% увеличение максимума маны";

  it("склеивает подряд идущие записи с общим multi-slot шаблоном", () => {
    const entries = [{ t: tpl }, { t: tpl }];
    const groups = groupEntriesByStatTemplate(entries, (e) => e.t);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries).toHaveLength(2);
  });

  it("не склеивает разные шаблоны", () => {
    const entries = [{ t: tpl }, { t: other }, { t: tpl }];
    const groups = groupEntriesByStatTemplate(entries, (e) => e.t);
    expect(groups.map((g) => g.entries.length)).toEqual([1, 1, 1]);
  });

  it("одиночная запись с multi-slot шаблоном остаётся в своей группе", () => {
    const groups = groupEntriesByStatTemplate([{ t: tpl }], (e) => e.t);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.entries).toHaveLength(1);
  });
});

describe("stripStatDescriptionMarkup", () => {
  it("убирает [DNT] и оставляет текст из [ID|text]", () => {
    expect(stripStatDescriptionMarkup("[DNT]Hello")).toBe("Hello");
    expect(stripStatDescriptionMarkup("[DirectFlight|дальность полета]")).toBe(
      "дальность полета",
    );
  });
});

describe("jewelLabel / conquerorLabel / ui", () => {
  it("переводит название самоцвета на RU и падает в EN", () => {
    expect(jewelLabel(4, "Militant Faith", "ru")).toBe("Воинственная вера");
    expect(jewelLabel(4, "Militant Faith", "en")).toBe("Militant Faith");
    expect(jewelLabel(99, "Unknown Jewel", "ru")).toBe("Unknown Jewel");
  });

  it("переводит имя завоевателя и падает в EN", () => {
    expect(conquerorLabel("Avarius", "ru")).toBe("Аварий");
    expect(conquerorLabel("Zorath", "ru")).toBe("Зорат");
    expect(conquerorLabel("Nobody", "ru")).toBe("Nobody");
  });

  it("ui() отдаёт локализованную подпись", () => {
    expect(ui("jewel", "ru")).toBe("Самоцвет");
    expect(ui("jewel", "en")).toBe("Jewel");
  });
});

describe("getJewelFlavorText / getJewelFlavorLines", () => {
  it("подставляет диапазон сида и завоевателя (RU)", () => {
    const text = getJewelFlavorText(1, 2000, 3000, "Doryani", "ru");
    expect(text).toContain("от 2000 до 3000");
    expect(text).toContain("Дориани");
  });

  it("разбивает по предложениям для многострочного вывода", () => {
    const lines = getJewelFlavorLines(1, 2000, 3000, "Doryani", "ru");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Дориани.");
    expect(lines[1]!.startsWith("Пассивные умения")).toBe(true);
  });

  it("возвращает пусто для неизвестного самоцвета", () => {
    expect(getJewelFlavorText(999, 1, 2, "x", "ru")).toBe("");
    expect(getJewelFlavorLines(999, 1, 2, "x", "en")).toEqual([]);
  });
});

describe("golden tooltip fixtures (§2.4)", () => {
  for (const c of golden.tooltipCases) {
    it(c.name, () => {
      const ruTpl = statNamesRuByStringId[c.statId];
      const enTpl = statTemplatesEnByStringId[c.statId];
      expect(ruTpl, `RU-шаблон для ${c.statId}`).toBeTruthy();
      expect(enTpl, `EN-шаблон для ${c.statId}`).toBeTruthy();
      expect(formatStatTemplate(ruTpl!, c.rolls)).toBe(c.expectedRu);
      expect(formatStatTemplate(enTpl!, c.rolls)).toBe(c.expectedEn);
    });
  }
});

describe("translateStatByDisplayString / getStatIdFromDisplayLines", () => {
  it("переводит EN display string из WASM на RU (EN остаётся как есть)", () => {
    for (const c of golden.displayStringCases) {
      expect(translateStatByDisplayString(c.display, "ru")).toBe(c.expectedRu);
      expect(translateStatByDisplayString(c.display, "en")).toBe(c.display);
    }
  });

  it("возвращает оригинал, если skeleton не найден в словаре", () => {
    expect(translateStatByDisplayString("Totally unknown string", "ru")).toBe(
      "Totally unknown string",
    );
  });

  it("находит stat id по нескольким строкам (join \\n и '. ')", () => {
    expect(
      getStatIdFromDisplayLines([
        "Auras from your Skills can only affect you",
        "Aura Skills have 30% more Aura Effect per 20% of maximum Mana they Reserve",
        "40% more Mana Reservation of Aura Skills",
      ]),
    ).toBe("keystone_supreme_ego");
  });

  it("находит stat id, когда литеральный знак есть в ключе словаря", () => {
    // Ключ содержит знак из EN-шаблона: "-__ to maximum number of Summoned Totems" (Runebinder),
    // "+__ to Minimum Rage" (minimum_rage). Скелетон сохраняет знак — совпадение есть.
    expect(
      getStatIdFromDisplayLines([
        "-10 to maximum number of Summoned Totems",
        "You can have an additional Brand Attached to an Enemy",
      ]),
    ).toBe("keystone_runebinder");
    expect(getStatIdFromDisplayLines(["+5 to Minimum Rage"])).toBe(
      "minimum_rage",
    );
  });

  it("находит stat id, когда значение отрицательное, а шаблон без знака", () => {
    // Шаблон без знака ("{0} to Strength" → "__ to Strength"), а отображаемое значение отрицательное.
    // Порядок вариантов (со знаком → без) даёт фолбэк на бесзнаковый скелетон.
    expect(getStatIdFromDisplayLines(["-10 to Strength"])).toBe(
      "additional_strength",
    );
  });

  it("переводит строки с ведущим знаком на RU", () => {
    expect(translateStatByDisplayString("+5 to Minimum Rage", "ru")).toBe(
      "+5 к минимуму свирепости",
    );
    expect(translateStatByDisplayString("-10 to Strength", "ru")).toBe(
      "-10 к силе",
    );
  });

  it("null для пустого списка строк", () => {
    expect(getStatIdFromDisplayLines([])).toBeNull();
  });

  it("statStringToId заполнен после ensureEnDictMaps", () => {
    expect(statStringToId["Adds __ to __ Fire Damage to Attacks"]).toBe(
      "attack_minimum_added_fire_damage",
    );
  });
});
