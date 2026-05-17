<script setup lang="ts">
import { computed } from "vue";
import type { Lang } from "@/lib/i18n";
import type { SearchResults } from "@/lib/skill_tree";
import SearchResultItem from "./SearchResultItem.vue";

const props = defineProps<{
  lang: Lang;
  searchResults: SearchResults;
  groupResults: boolean;
  jewel: number;
  conqueror: string;
  platform: string;
  league: string;
}>();

const emit = defineEmits<{ highlight: [seed: number, passives: number[]] }>();

const expandedGroup = defineModel<number | "">("expandedGroup", {
  default: "",
});

const groupedKeys = computed(() =>
  Object.keys(props.searchResults.grouped)
    .map((x) => Number(x))
    .sort((a, b) => a - b)
    .reverse(),
);

const totalCount = computed(() => props.searchResults.raw.length);
</script>

<template>
  <div class="mt-1 space-y-3">
    <p class="text-xs font-medium uppercase tracking-wide text-muted">
      {{ totalCount }} seed{{ totalCount === 1 ? "" : "s" }}
    </p>

    <div
      v-if="groupResults"
      class="max-h-[60vh] space-y-2 overflow-y-auto pr-0.5 scrollbar-custom"
    >
      <section
        v-for="k in groupedKeys"
        :key="k"
        class="overflow-hidden rounded-lg border border-surface-border/20 bg-black/15"
      >
        <button
          type="button"
          class="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
          :class="expandedGroup === k ? 'bg-white/5' : ''"
          @click="expandedGroup = expandedGroup === k ? '' : k"
        >
          <span class="min-w-0 flex-1">
            <span class="font-semibold text-heading">{{ k }}</span>
            <span class="text-muted">
              match{{ k > 1 ? "es" : "" }} ·
              {{ searchResults.grouped[k].length }}
            </span>
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="shrink-0 text-muted transition-transform duration-200"
            :class="{ 'rotate-180': expandedGroup === k }"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div
          v-if="expandedGroup === k"
          class="space-y-2 border-t border-surface-border/20 p-2"
        >
          <SearchResultItem
            v-for="set in searchResults.grouped[k]"
            :key="set.seed"
            :set="set"
            :lang="lang"
            :jewel="jewel"
            :conqueror="conqueror"
            :platform="platform"
            :league="league"
            @highlight="(seed, passives) => $emit('highlight', seed, passives)"
          />
        </div>
      </section>
    </div>

    <div
      v-else
      class="max-h-[60vh] space-y-2 overflow-y-auto pr-0.5 scrollbar-custom"
    >
      <SearchResultItem
        v-for="set in searchResults.raw"
        :key="set.seed"
        :set="set"
        :lang="lang"
        :jewel="jewel"
        :conqueror="conqueror"
        :platform="platform"
        :league="league"
        @highlight="(seed, passives) => $emit('highlight', seed, passives)"
      />
    </div>
  </div>
</template>
