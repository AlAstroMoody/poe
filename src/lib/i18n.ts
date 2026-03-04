const STORAGE_KEY = "timeless-jewels-lang";

export type Lang = "en" | "ru";

export function getLanguage(): Lang {
  if (typeof localStorage === "undefined") return "ru";
  const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
  return stored === "en" ? "en" : "ru";
}

export function setLanguage(lang: Lang): void {
  if (typeof localStorage !== "undefined")
    localStorage.setItem(STORAGE_KEY, lang);
}
