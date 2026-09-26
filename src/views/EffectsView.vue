<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/AppButton.vue";
import catalog from "@/lib/keystoneCatalog.json";
import {
  conquerorLabel,
  jewelLabel,
  jewelNamesRu,
  ui,
} from "@/lib/dict";
import { getLanguage, setLanguage, type Lang } from "@/lib/i18n";

type CatalogEntry = (typeof catalog.entries)[number];

const router = useRouter();
const lang = ref<Lang>(getLanguage());
const filter = ref("");

function entryMatches(e: CatalogEntry, q: string): boolean {
  if (!q) return true;
  const hay = [
    e.nameEn,
    e.nameRu,
    e.conqueror,
    conquerorLabel(e.conqueror, "ru"),
    e.jewelEn,
    jewelNamesRu[e.jewel] ?? "",
    ...e.linesEn,
    ...e.linesRu,
    e.id,
  ]
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

const groups = computed(() => {
  const q = filter.value.trim().toLowerCase();
  const byJewel = new Map<number, CatalogEntry[]>();
  for (const e of catalog.entries) {
    if (!entryMatches(e, q)) continue;
    const list = byJewel.get(e.jewel) ?? [];
    list.push(e);
    byJewel.set(e.jewel, list);
  }
  return [...byJewel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([jewel, entries]) => ({
      jewel,
      jewelName: jewelLabel(
        jewel,
        entries[0]?.jewelEn ?? String(jewel),
        lang.value,
      ),
      entries: entries.sort((a, b) =>
        conquerorLabel(a.conqueror, lang.value).localeCompare(
          conquerorLabel(b.conqueror, lang.value),
          lang.value === "ru" ? "ru" : "en",
        ),
      ),
    }));
});

function setLang(value: Lang) {
  setLanguage(value);
  lang.value = value;
}

function openOnTree(entry: CatalogEntry) {
  router.push({
    path: "/tree",
    query: {
      jewel: String(entry.jewel),
      conqueror: entry.conqueror,
    },
  });
}

function nameOf(e: CatalogEntry) {
  return lang.value === "ru" ? e.nameRu : e.nameEn;
}

function linesOf(e: CatalogEntry) {
  return lang.value === "ru" ? e.linesRu : e.linesEn;
}
</script>

<template>
  <div class="effects min-h-screen bg-black text-gray-50 p-8 pb-16">
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <h1
          class="font-celtes text-heading text-2xl mb-2 first-letter:text-[1.2em]"
        >
          {{ ui("navEffects", lang) }}
        </h1>
        <p class="max-w-2xl text-gray-400 text-sm mb-3">
          {{ ui("effectsHint", lang) }}
        </p>
        <label class="sr-only" for="effects-filter">{{
          ui("effectsFilter", lang)
        }}</label>
        <input
          id="effects-filter"
          v-model="filter"
          type="search"
          :placeholder="ui('effectsFilter', lang)"
          class="w-full max-w-md rounded-md border border-heading/30 bg-black/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 outline-none focus:border-heading/60"
        />
      </div>
      <div
        class="flex gap-1"
        role="group"
        :aria-label="ui('langAria', lang)"
      >
        <button
          type="button"
          class="cursor-pointer rounded px-2 py-0.5 text-sm transition-opacity"
          :class="
            lang === 'en'
              ? 'bg-heading/20 opacity-100'
              : 'opacity-60 hover:opacity-100'
          "
          @click="setLang('en')"
        >
          EN
        </button>
        <button
          type="button"
          class="cursor-pointer rounded px-2 py-0.5 text-sm transition-opacity"
          :class="
            lang === 'ru'
              ? 'bg-heading/20 opacity-100'
              : 'opacity-60 hover:opacity-100'
          "
          @click="setLang('ru')"
        >
          RU
        </button>
      </div>
    </div>

    <p v-if="groups.length === 0" class="text-gray-400 text-sm">
      {{ ui("noResults", lang) }}
    </p>

    <div class="space-y-10 max-w-[75rem]">
      <section v-for="g in groups" :key="g.jewel">
        <h2 class="font-celtes text-heading text-lg mb-3 tracking-[0.02em]">
          {{ g.jewelName }}
          <span
            v-if="lang === 'ru' && jewelNamesRu[g.jewel]"
            class="text-gray-500 text-sm font-normal ml-2"
          >
            {{ g.entries[0]?.jewelEn }}
          </span>
        </h2>
        <ul class="grid gap-3 md:grid-cols-2">
          <li v-for="e in g.entries" :key="e.id">
            <button
              type="button"
              class="effects-card w-full text-left rounded-lg border border-heading/25 bg-heading/5 px-4 py-3 transition-colors hover:border-heading/50 hover:bg-heading/10 cursor-pointer"
              @click="openOnTree(e)"
            >
              <div
                class="flex flex-wrap items-baseline justify-between gap-2 mb-1"
              >
                <span class="font-celtes text-heading text-base">
                  {{ nameOf(e) }}
                </span>
                <span class="text-heading/70 text-sm">
                  {{ conquerorLabel(e.conqueror, lang) }}
                </span>
              </div>
              <ul class="mt-1 space-y-0.5 text-sm text-gray-300">
                <li v-for="(line, i) in linesOf(e)" :key="i">
                  {{ line }}
                </li>
              </ul>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <nav class="mt-10 flex flex-wrap gap-3">
      <AppButton to="/tree">{{ ui("navCalc", lang) }}</AppButton>
      <AppButton to="/">{{ ui("backHome", lang) }}</AppButton>
    </nav>
  </div>
</template>
