<script setup lang="ts">
import { computed } from "vue";
import { openTrade } from "@/lib/skill_tree";
import { ui } from "@/lib/dict";
import type { Lang } from "@/lib/i18n";
import AppSelect from "./AppSelect.vue";

const props = defineProps<{
  lang: Lang;
  showResults: boolean;
  searchResults: any;
  league: string;
  leagues: { value: string; label: string }[];
  platform: string;
  selectedJewel: number;
  selectedConqueror: string;
  groupResults: boolean;
}>();

const emit = defineEmits<{
  "update:league": [v: string];
  "update:platform": [v: string];
  "update:groupResults": [v: boolean];
  "update:showResults": [v: boolean];
  collapse: [];
}>();

const title = computed(() =>
  props.showResults && props.searchResults
    ? ui("results", props.lang)
    : ui("title", props.lang),
);

const menuBtn =
  "rounded-md border border-surface-border/25 bg-white/5 px-3 py-2 text-sm text-inherit transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
</script>

<template>
  <header class="mb-4 space-y-3 border-b border-surface-border/20 pb-3">
    <div class="flex items-start gap-3">
      <h3
        class="min-w-0 flex-1 text-base font-semibold leading-snug text-heading md:text-lg"
      >
        {{ title }}
      </h3>
      <div class="flex shrink-0 items-center gap-1">
        <button
          v-if="searchResults"
          type="button"
          :class="[menuBtn, 'whitespace-nowrap font-medium']"
          @click="emit('update:showResults', !showResults)"
        >
          {{ showResults ? ui("config", lang) : ui("results", lang) }}
        </button>
        <button
          type="button"
          class="flex cursor-pointer flex-col justify-center gap-1 rounded-md border border-transparent p-2 text-inherit opacity-70 transition-opacity hover:border-surface-border/25 hover:bg-white/5 hover:opacity-100"
          aria-label="Collapse"
          @click="emit('collapse')"
        >
          <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
          <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
          <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
        </button>
      </div>
    </div>

    <template v-if="searchResults && showResults">
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AppSelect
          :model-value="league"
          :options="leagues"
          :dropdown-min-width="280"
          class="w-full"
          @update:model-value="(v) => emit('update:league', String(v))"
        />
        <AppSelect
          :model-value="platform"
          :options="[
            { value: 'PC', label: 'PC' },
            { value: 'Xbox', label: 'Xbox' },
            { value: 'Playstation', label: 'Playstation' },
          ]"
          :dropdown-min-width="200"
          class="w-full"
          @update:model-value="(v) => emit('update:platform', String(v))"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          :class="menuBtn"
          :disabled="!searchResults"
          @click="
            openTrade(
              selectedJewel,
              selectedConqueror,
              searchResults!.raw,
              platform,
              league,
            )
          "
        >
          {{ ui("trade", lang) }}
        </button>
        <button
          type="button"
          :class="[
            menuBtn,
            groupResults &&
              'border-accent/40 bg-accent/15 text-accent-muted',
          ]"
          :disabled="!searchResults"
          @click="emit('update:groupResults', !groupResults)"
        >
          {{ ui("grouped", lang) }}
        </button>
      </div>
    </template>
  </header>
</template>
