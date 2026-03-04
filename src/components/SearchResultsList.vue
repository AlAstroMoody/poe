<script setup lang="ts">
import { computed } from "vue";
import type { SearchResults } from "@/lib/skill_tree";
import SearchResultItem from "./SearchResultItem.vue";

const props = defineProps<{
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
</script>

<template>
  <div
    v-if="groupResults"
    class="flex flex-col overflow-auto max-h-[60vh]"
  >
    <div
      v-for="k in groupedKeys"
      :key="k"
      class="flex flex-col mb-2 last:mb-0"
    >
      <button
        type="button"
        class="w-full py-2 px-4 mb-0.5 rounded bg-neutral-500/30 hover:bg-neutral-500/45 flex flex-row justify-between items-center text-inherit cursor-pointer border-none text-base"
        @click="expandedGroup = expandedGroup === k ? '' : k"
      >
        <span>
          {{ k }} Match{{ k > 1 ? "es" : "" }} [{{
            searchResults.grouped[k].length
          }}]
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
          class="shrink-0 transition-transform duration-200 ease-out"
          :class="{ 'rotate-180': expandedGroup === k }"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <div
        v-if="expandedGroup === k"
        class="mt-1 pl-2 border-l-2 border-neutral-500/40 flex flex-col"
      >
        <SearchResultItem
          v-for="set in searchResults.grouped[k]"
          :key="set.seed"
          :set="set"
          :jewel="jewel"
          :conqueror="conqueror"
          :platform="platform"
          :league="league"
          @highlight="(seed, passives) => $emit('highlight', seed, passives)"
        />
      </div>
    </div>
  </div>
  <div v-else class="flex flex-col overflow-auto max-h-[60vh]">
    <SearchResultItem
      v-for="set in searchResults.raw"
      :key="set.seed"
      :set="set"
      :jewel="jewel"
      :conqueror="conqueror"
      :platform="platform"
      :league="league"
      @highlight="(seed, passives) => $emit('highlight', seed, passives)"
    />
  </div>
</template>
