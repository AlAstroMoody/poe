<script setup lang="ts">
import { ref, watch } from "vue";
import type { Lang } from "@/lib/i18n";
import { ui } from "@/lib/dict";
import SearchResultsList from "./SearchResultsList.vue";
import TreeMenuHeader from "./TreeMenuHeader.vue";
import SeedModePanel from "./SeedModePanel.vue";
import StatsModePanel from "./StatsModePanel.vue";
import { useLeagueData } from "@/composables/useLeagueData";
import { useTreeMenuState } from "@/composables/useTreeMenuState";
import { useReverseSearch } from "@/composables/useReverseSearch";
import AppSelect from "./AppSelect.vue";

const props = defineProps<{
  lang: Lang;
  circledNode: number | undefined;
  disabled: number[];
  selectedJewel: number;
  selectedConqueror: string;
  seed: number;
  highlighted: number[];
}>();

const emit = defineEmits<{
  "update:selectedJewel": [v: number];
  "update:selectedConqueror": [v: string];
  "update:seed": [v: number];
  "update:highlighted": [v: number[]];
  "update:disabled": [v: number[]];
  "update-url": [];
}>();

const {
  jewels,
  conquerors,
  affectedNodes,
  seedValid,
  mode,
  selectedStats,
  statListFilter,
  filteredAvailableStats,
  collapsed,
  seedTouched,
  notableIds,
  passiveIds,
  isAllSelected,
  isAllNotablesSelected,
  isAllPassivesSelected,
  allAffectedSkillIds,
} = useTreeMenuState({
  lang: () => props.lang,
  circledNode: () => props.circledNode,
  selectedJewel: () => props.selectedJewel,
  selectedConqueror: () => props.selectedConqueror,
  seed: () => props.seed,
  disabled: () => props.disabled,
});

const { platform, league, leagues } = useLeagueData();

const addStatValue = ref<string | number>("");

const {
  minTotalWeight,
  searching,
  searchResults,
  showResults,
  groupResults,
  expandedGroup,
  search,
} = useReverseSearch({
  circledNode: () => props.circledNode,
  selectedJewel: () => props.selectedJewel,
  selectedConqueror: () => props.selectedConqueror,
  disabled: () => props.disabled,
});

function highlight(newSeed: number, passives: number[]) {
  emit("update:seed", newSeed);
  emit("update:highlighted", passives);
  emit("update-url");
}

function updateUrl() {
  emit("update-url");
}

function onSeedBlur() {
  seedTouched.value = true;
  updateUrl();
}
function setMode(m: "seed" | "stats") {
  mode.value = m;
  updateUrl();
}
function changeJewel() {
  selectedStats.value = {};
  statListFilter.value = "";
  updateUrl();
}
function selectStat(statId: number) {
  selectedStats.value = {
    ...selectedStats.value,
    [statId]: { weight: 1, min: 0, id: statId },
  };
  updateUrl();
}
function removeStat(id: number) {
  const next = { ...selectedStats.value };
  delete next[id];
  selectedStats.value = next;
  updateUrl();
}
function selectAll() {
  const all = allAffectedSkillIds.value;
  const allSelected = props.disabled.length === 0;
  emit("update:disabled", allSelected ? all : []);
}
function selectAllNotables() {
  const notables = notableIds.value;
  const notablesSet = new Set(notables);
  const next = isAllNotablesSelected.value
    ? [...props.disabled, ...notables]
    : props.disabled.filter((id) => !notablesSet.has(id));
  emit("update:disabled", next);
}
function selectAllPassives() {
  const passives = passiveIds.value;
  const passivesSet = new Set(passives);
  const next = isAllPassivesSelected.value
    ? [...props.disabled, ...passives]
    : props.disabled.filter((id) => !passivesSet.has(id));
  emit("update:disabled", next);
}
function deselectAll() {
  emit("update:disabled", [...allAffectedSkillIds.value]);
}

watch(addStatValue, (v) => {
  if (v !== "" && v != null) {
    selectStat(Number(v));
    addStatValue.value = "";
  }
});
</script>

<template>
  <div class="tree-menu-root" data-tree-menu>
    <div
      v-if="!collapsed"
      class="themed absolute top-0 left-0 z-40 max-h-screen w-[min(100vw-1rem,22.5rem)] overflow-x-hidden overflow-y-auto rounded-br-xl border border-surface-border/30 bg-surface/95 shadow-surface backdrop-blur-md md:w-[36rem] lg:w-[40rem] xl:w-[42rem]"
    >
      <div
        v-if="searching"
        class="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-br-xl bg-black/60 backdrop-blur-sm"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          class="size-10 shrink-0 rounded-full border-2 border-heading/30 border-t-heading animate-spin"
          aria-hidden
        />
      </div>
      <div class="relative p-4 md:p-5">
        <TreeMenuHeader
          :lang="lang"
          :show-results="showResults"
          :search-results="searchResults"
          :league="league"
          :leagues="leagues"
          :platform="platform"
          :selected-jewel="selectedJewel"
          :selected-conqueror="selectedConqueror"
          :group-results="groupResults"
          @update:league="league = $event"
          @update:platform="platform = $event"
          @update:group-results="groupResults = $event"
          @update:show-results="showResults = $event"
          @collapse="collapsed = true"
        />

        <div v-if="!showResults">
          <label
            class="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
            >{{ ui("jewel", lang) }}</label
          >
          <AppSelect
            :model-value="selectedJewel"
            :options="jewels"
            class="w-full"
            @update:model-value="
              (v: string | number) => {
                emit('update:selectedJewel', Number(v));
                emit('update:selectedConqueror', '');
                changeJewel();
              }
            "
          />

          <div v-if="selectedJewel" class="mt-5">
            <label
              class="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
            >
              {{ ui("conqueror", lang) }}
            </label>
            <AppSelect
              :model-value="selectedConqueror"
              :options="conquerors"
              :placeholder="ui('selectPlaceholder', lang)"
              class="w-full"
              @update:model-value="
                (v: string | number) => {
                  emit('update:selectedConqueror', String(v));
                  updateUrl();
                }
              "
            />
          </div>

          <div
            v-if="
              selectedConqueror &&
              conquerors.some((c) => c.value === selectedConqueror)
            "
            class="mt-5"
          >
            <div
              class="flex rounded-lg border border-surface-border/30 bg-black/25 p-0.5"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                :class="
                  mode === 'seed'
                    ? 'bg-white/12 text-heading shadow-sm'
                    : 'text-muted hover:text-white'
                "
                :aria-selected="mode === 'seed'"
                @click="setMode('seed')"
              >
                {{ ui("enterSeed", lang) }}
              </button>
              <button
                type="button"
                role="tab"
                class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                :class="
                  mode === 'stats'
                    ? 'bg-white/12 text-heading shadow-sm'
                    : 'text-muted hover:text-white'
                "
                :aria-selected="mode === 'stats'"
                @click="setMode('stats')"
              >
                {{ ui("selectStats", lang) }}
              </button>
            </div>

            <SeedModePanel
              v-if="mode === 'seed'"
              :lang="lang"
              :seed="seed"
              :seed-valid="seedValid"
              :seed-touched="seedTouched"
              :circled-node="circledNode"
              :selected-jewel="selectedJewel"
              :selected-conqueror="selectedConqueror"
              :highlighted="highlighted"
              @update:seed="emit('update:seed', $event)"
              @highlight="highlight"
              @seed-blur="onSeedBlur()"
            />

            <StatsModePanel
              v-else-if="mode === 'stats'"
              :lang="lang"
              :stat-list-filter="statListFilter"
              :filtered-available-stats="filteredAvailableStats"
              :add-stat-value="addStatValue"
              :selected-stats="selectedStats"
              :min-total-weight="minTotalWeight"
              :searching="searching"
              :disabled="disabled"
              :affected-nodes-length="affectedNodes.length"
              :is-all-selected="isAllSelected"
              :is-all-notables-selected="isAllNotablesSelected"
              :is-all-passives-selected="isAllPassivesSelected"
              @update:stat-list-filter="statListFilter = $event"
              @update:add-stat-value="addStatValue = $event"
              @update:min-total-weight="minTotalWeight = $event"
              @update:selected-stats="selectedStats = $event"
              @select-stat="selectStat"
              @remove-stat="removeStat"
              @select-all="selectAll"
              @select-all-notables="selectAllNotables"
              @select-all-passives="selectAllPassives"
              @deselect-all="deselectAll"
              @search="search(selectedStats)"
            />

            <p
              v-if="!circledNode"
              class="mt-4 rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-accent-muted"
            >
              {{ ui("clickJewelSocket", lang) }}
            </p>
          </div>
        </div>

        <p
          v-if="
            showResults && (!searchResults || searchResults.raw.length === 0)
          "
          class="mt-4 text-sm text-muted"
        >
          {{ ui("noResults", lang) }}
        </p>

        <SearchResultsList
          v-if="showResults && searchResults && searchResults.raw.length > 0"
          :lang="lang"
          :search-results="searchResults"
          :group-results="groupResults"
          :jewel="selectedJewel"
          :conqueror="selectedConqueror"
          :platform="platform"
          :league="league"
          v-model:expanded-group="expandedGroup"
          @highlight="highlight"
        />
      </div>
    </div>

    <button
      v-else
      type="button"
      class="absolute top-0 left-0 z-40 flex cursor-pointer flex-col justify-center gap-1 rounded-br-xl border border-surface-border/30 bg-surface/95 p-4 pt-5 text-heading shadow-surface backdrop-blur-md transition-colors hover:bg-surface"
      aria-label="Open menu"
      @click="collapsed = false"
    >
      <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
      <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
      <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
    </button>
  </div>
</template>
