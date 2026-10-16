/**
 * Headless-загрузка `calculator.wasm` + UI-данных для смоук-тестов данных (§2 бэклога).
 *
 * Повторяет ровно тот путь, что и приложение
 * (`loadWasm` → `loadUiData` → `loadSkillTree`), но без DOM:
 * подменяем `window`/`Go`/`fetch` и отдаём файлы из `public/`.
 * Так смоук гоняет НАСТОЯЩИЙ продовый код расчёта и форматирования, а не дубликат.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Корень `public/` — источник wasm/data/abyss LUT в headless-режиме. */
export const PUBLIC_DIR = path.join(REPO_ROOT, "public");

function contentTypeFor(rel: string): string {
  if (rel.endsWith(".wasm")) return "application/wasm";
  if (rel.endsWith(".js")) return "text/javascript";
  if (rel.endsWith(".json")) return "application/json";
  if (rel.endsWith(".gz")) return "application/gzip";
  return "application/octet-stream";
}

/**
 * Локальный fetch-шим: любой абсолютный путь ("/calculator.wasm", "/data/*.json.gz",
 * "/abyss-affected/…") отдаётся из `public/`. Нужен, т.к. wasmDataService/uiData/abyss
 * грузят ресурсы через `fetch` с `import.meta.env.BASE_URL`.
 */
function installFetchShim(): void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    let pathname: string;
    try {
      pathname = new URL(rawUrl, "http://localhost").pathname;
    } catch {
      return original(input, init);
    }
    if (!pathname.startsWith("/")) return original(input, init);

    const rel = decodeURIComponent(pathname.replace(/^\/+/, ""));
    const filePath = path.resolve(PUBLIC_DIR, rel);
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
      return new Response(null, { status: 404 });
    }
    try {
      const buf = await readFile(filePath);
      return new Response(buf, {
        status: 200,
        headers: {
          "content-type": contentTypeFor(rel),
          "content-length": String(buf.byteLength),
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  }) as typeof fetch;
}

/** Eval `public/wasm_exec.js` (classic IIFE, ставит `globalThis.Go`). */
async function installGoRuntime(): Promise<void> {
  if ((globalThis as { Go?: unknown }).Go) return;
  const src = await readFile(path.join(PUBLIC_DIR, "wasm_exec.js"), "utf8");
  vm.runInThisContext(src, { filename: "public/wasm_exec.js" });
}

let bootPromise: Promise<void> | null = null;

/**
 * Идемпотентно поднимает WASM + UI-данные + дерево. Бросает, если что-то не загрузилось.
 */
export function bootstrapWasmData(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      // wasmDataService читает window.Go / globalThis.go — в Node window нет, выравниваем на globalThis.
      (globalThis as unknown as { window: typeof globalThis }).window =
        globalThis;
      installFetchShim();
      await installGoRuntime();

      const { loadWasm, isWasmReady } = await import("@/services/wasmDataService");
      // loadWasm не await-ит go.run (Go main держит select{}), но данные уже на globalThis.go.
      await loadWasm();
      if (!isWasmReady()) {
        throw new Error("WASM не готов после loadWasm (timeless-jewels не найден)");
      }

      const { loadUiData } = await import("@/lib/uiData");
      await loadUiData();

      const { loadSkillTree } = await import("@/lib/skill_tree");
      await loadSkillTree();
    })().catch((err) => {
      bootPromise = null;
      throw err;
    });
  }
  return bootPromise;
}
