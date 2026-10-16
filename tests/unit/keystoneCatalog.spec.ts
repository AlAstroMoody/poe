import { describe, expect, it } from "vitest";
import { conquerorLabel, jewelLabel } from "@/lib/dict";
import catalog from "@/lib/keystoneCatalog.json";

type Entry = {
  id: string;
  jewel: number;
  jewelEn: string;
  conqueror: string;
  nameEn: string;
  nameRu: string;
  linesEn: string[];
  linesRu: string[];
};

const entries = (catalog as { entries: Entry[] }).entries;

describe("keystoneCatalog — «золотые» данные справочника кейстоунов", () => {
  it("Power of Purpose переведён и привязан к Militant Faith · Avarius", () => {
    const pop = entries.find((e) => e.nameEn === "Power of Purpose");
    expect(pop, "запись Power of Purpose").toBeTruthy();
    expect(pop!.nameRu).toBe("Могучее намерение");
    expect(pop!.jewel).toBe(4);
    expect(pop!.conqueror).toBe("Avarius");
    // Локализованное имя завоевателя совпадает с conquerorLabel.
    expect(conquerorLabel(pop!.conqueror, "ru")).toBe("Аварий");
    expect(jewelLabel(pop!.jewel, pop!.jewelEn, "ru")).toBe("Воинственная вера");
  });

  it("каждая запись заполнена (id, jewel 1–11, RU-имя, непустые строки)", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.id, "id").toBeTruthy();
      expect(e.jewel).toBeGreaterThanOrEqual(1);
      expect(e.jewel).toBeLessThanOrEqual(11);
      expect(e.nameRu, `nameRu для ${e.id}`).toBeTruthy();
      expect(e.nameEn, `nameEn для ${e.id}`).toBeTruthy();
      expect(e.linesRu.length, `linesRu для ${e.id}`).toBeGreaterThan(0);
      expect(e.linesRu.every((l) => l.trim().length > 0)).toBe(true);
    }
  });

  it("id'шники уникальны", () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
