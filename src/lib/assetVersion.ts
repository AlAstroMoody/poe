/** Версия приложения (из package.json через Vite define). Бамп при деплое → новый ?v= → новый кэш. */
export const APP_VERSION: string =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || "0";

/** Добавляет ?v=<version> (в prod). В dev — cache:bust через timestamp уже в fetch options у wasm. */
export function withAssetVersion(url: string): string {
  if (!APP_VERSION || APP_VERSION === "0") return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}v=${encodeURIComponent(APP_VERSION)}`;
}
