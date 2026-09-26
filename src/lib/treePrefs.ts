/** Последний выбор на дереве (URL важнее при наличии query). */

const STORAGE_KEY = "poe-tree-prefs";

export type TreePrefs = {
  jewel?: number;
  conqueror?: string;
  location?: number;
  classStartIndex?: number;
  ascendancyName?: string;
};

export function loadTreePrefs(): TreePrefs {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TreePrefs;
    return {
      jewel:
        typeof parsed.jewel === "number" && Number.isFinite(parsed.jewel)
          ? parsed.jewel
          : undefined,
      conqueror:
        typeof parsed.conqueror === "string" && parsed.conqueror
          ? parsed.conqueror
          : undefined,
      location:
        typeof parsed.location === "number" && Number.isFinite(parsed.location)
          ? parsed.location
          : undefined,
      classStartIndex:
        typeof parsed.classStartIndex === "number" &&
        Number.isFinite(parsed.classStartIndex)
          ? parsed.classStartIndex
          : undefined,
      ascendancyName:
        typeof parsed.ascendancyName === "string"
          ? parsed.ascendancyName
          : undefined,
    };
  } catch {
    return {};
  }
}

export function saveTreePrefs(prefs: TreePrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}
