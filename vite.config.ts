import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf-8"),
) as { version: string };

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // Новый SW сразу активируется. HTML не в precache → shell всегда с сети.
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: [
        "favicons/favicon.ico",
        "favicons/favicon-16x16.png",
        "favicons/favicon-32x32.png",
        "wasm_exec.js",
      ],
      manifest: {
        name: "Вневременные самоцветы и Бездна",
        short_name: "Самоцветы PoE",
        description:
          "Калькулятор вневременных самоцветов и личей Бездны Path of Exile",
        lang: "ru",
        start_url: "/poe/",
        scope: "/poe/",
        display: "standalone",
        background_color: "#171717",
        theme_color: "#171717",
        icons: [
          {
            src: "favicons/favicon-32x32.png",
            sizes: "32x32",
            type: "image/png",
          },
          {
            src: "favicons/favicon-16x16.png",
            sizes: "16x16",
            type: "image/png",
          },
          {
            src: "favicons/favicon.ico",
            sizes: "48x48",
            type: "image/x-icon",
          },
        ],
      },
      workbox: {
        // Без HTML: index.html всегда с сети. null = не подставлять offline shell.
        globPatterns: ["**/*.{js,css,ico,png,svg,webp,woff2,json}"],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Ключ кэша включает ?v= → после бампа версии файл качается один раз.
            urlPattern: ({ url }) => url.pathname.endsWith("/calculator.wasm"),
            handler: "CacheFirst",
            options: {
              cacheName: "poe-wasm",
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.includes("/abyss-affected/") &&
              url.pathname.endsWith(".bin"),
            handler: "CacheFirst",
            options: {
              cacheName: "poe-abyss-bins",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith("/wasm_exec.js"),
            handler: "CacheFirst",
            options: {
              cacheName: "poe-wasm-exec",
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // SkillTree / translations / possible_stats (?v= bust)
            urlPattern: ({ url }) =>
              url.pathname.includes("/data/") &&
              (url.pathname.endsWith(".json.gz") ||
                url.pathname.endsWith(".json")),
            handler: "CacheFirst",
            options: {
              cacheName: "poe-ui-data",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: "/poe/",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
