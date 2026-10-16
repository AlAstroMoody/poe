import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Конфиг смоук-тестов данных (§2 бэклога): отдельно от `vitest.config.ts`,
 * т.к. поднимает wasm (~9 МБ) + UI-данные и ходит в `public/` через fetch-шим.
 * Запуск: `npm run test:smoke-data`. Тесты дерева живут в `tests/smoke/**`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/smoke/**/*.spec.ts"],
    // wasm + 9 МБ данных + прогон десятков кейсов: дефолтных 5с мало.
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // Прогресс/логи Go (fs.writeSync → console) не должны тонуть в шуме.
    silent: false,
  },
});
