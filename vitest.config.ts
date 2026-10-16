import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Отдельный конфиг для тестов.
 * Намеренно НЕ тянет vite.config.ts (там PWA-плагин и base "/poe/" — в тестах не нужны).
 * Каталог tests/ вне include tsconfig.app.json, поэтому `vue-tsc -b` (build) его не видит.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Быстрый юнит-слой. Смоук данных (§2) живёт в tests/smoke/** и запускается
    // отдельным конфигом (vitest.smoke.config.ts) — он поднимает WASM ~9 МБ.
    include: ["tests/unit/**/*.spec.ts"],
  },
});
