<script setup lang="ts">
import type { SearchResults } from "@/lib/skill_tree";
import SearchResultItem from "./SearchResultItem.vue";

defineProps<{
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
</script>

<template>
  <div v-if="groupResults" class="search-results-grouped">
    <button
      v-for="k in Object.keys(searchResults.grouped)
        .map((x) => Number(x))
        .sort((a, b) => a - b)
        .reverse()"
      :key="k"
      type="button"
      class="group-toggle"
      @click="expandedGroup = expandedGroup === k ? '' : k"
    >
      <span
        >{{ k }} Match{{ k > 1 ? "es" : "" }} [{{
          searchResults.grouped[k].length
        }}]</span
      >
      <span>{{ expandedGroup === k ? "^" : "V" }}</span>
    </button>
    <div
      v-for="k in Object.keys(searchResults.grouped).map((x) => Number(x))"
      v-show="expandedGroup === k"
      :key="'list-' + k"
      class="group-list"
    >
      <SearchResultItem
        v-for="(set, idx) in searchResults.grouped[k]"
        :key="idx"
        :set="set"
        :jewel="jewel"
        :conqueror="conqueror"
        :platform="platform"
        :league="league"
        @highlight="(seed, passives) => $emit('highlight', seed, passives)"
      />
    </div>
  </div>
  <div v-else class="search-results-raw">
    <SearchResultItem
      v-for="(set, idx) in searchResults.raw"
      :key="idx"
      :set="set"
      :jewel="jewel"
      :conqueror="conqueror"
      :platform="platform"
      :league="league"
      @highlight="(seed, passives) => $emit('highlight', seed, passives)"
    />
  </div>
</template>

<style scoped>
.search-results-grouped,
.search-results-raw {
  display: flex;
  flex-direction: column;
  overflow: auto;
  max-height: 60vh;
}
.group-toggle {
  width: 100%;
  padding: 0.5rem 1rem;
  margin-bottom: 0.5rem;
  background: rgba(115, 115, 115, 0.3);
  border-radius: 4px;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  color: inherit;
  cursor: pointer;
  border: none;
  font-size: 1rem;
}
.group-toggle:hover {
  background: rgba(115, 115, 115, 0.45);
}
.group-list {
  min-height: 200px;
  margin-bottom: 0.5rem;
}
</style>
