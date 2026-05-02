/**
 * В prod: `?treeDebug=1` или `localStorage.setItem('poeTreeDebug','1')`.
 * В `npm run dev` логи дерева (alternate и т.д.) включены сами.
 */

const LS_KEY = "poeTreeDebug";

export function isTreeDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (import.meta.env.DEV) return true;
    if (new URLSearchParams(window.location.search).get("treeDebug") === "1")
      return true;
    if (window.localStorage?.getItem(LS_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function treeDebugLog(
  label: string,
  data: Record<string, unknown>,
): void {
  if (!isTreeDebugEnabled()) return;
  console.info(`[poe-tree] ${label}`, data);
}
