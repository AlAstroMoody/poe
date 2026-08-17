<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { Lang } from "@/lib/i18n";
import { ui } from "@/lib/dict";
import SearchResultsList from "./SearchResultsList.vue";
import TreeMenuHeader from "./TreeMenuHeader.vue";
import MenuBurgerButton from "./MenuBurgerButton.vue";
import SeedModePanel from "./SeedModePanel.vue";
import StatsModePanel from "./StatsModePanel.vue";
import { useLeagueData } from "@/composables/useLeagueData";
import { useTreeMenuState } from "@/composables/useTreeMenuState";
import { useReverseSearch } from "@/composables/useReverseSearch";
import { getData } from "@/services/wasmDataService";
import AppSelect from "./AppSelect.vue";
import { skillTree } from "@/lib/skill_tree";
import { ZORATH_EMPTY_ASCENDANCIES } from "@/lib/zorathPath";

const props = defineProps<{
  lang: Lang;
  circledNode: number | undefined;
  disabled: number[];
  selectedJewel: number;
  selectedConqueror: string;
  seed: number;
  highlighted: number[];
  classStartIndex: number;
  ascendancyName: string;
}>();

const emit = defineEmits<{
  "update:selectedJewel": [v: number];
  "update:selectedConqueror": [v: string];
  "update:seed": [v: number];
  "update:highlighted": [v: number[]];
  "update:disabled": [v: number[]];
  "update:classStartIndex": [v: number];
  "update:ascendancyName": [v: string];
  "update-url": [];
}>();

const {
  familyJewels,
  jewelFamily,
  conquerors,
  showConquerorSelect,
  isAbyssJewel,
  isZorathJewel,
  classOptions,
  ascendancyOptions,
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
  classStartIndex: () => props.classStartIndex,
  ascendancyName: () => props.ascendancyName,
});

const jewelFamilyOptions = computed(() => [
  { value: "timeless", label: ui("jewelFamilyTimeless", props.lang) },
  { value: "abyss", label: ui("jewelFamilyAbyss", props.lang) },
]);

function ascendancyIdsForClass(classIndex: number): string[] {
  const cls = skillTree?.classes?.[classIndex];
  if (!cls) return [];
  return cls.ascendancies
    .filter((a) => !ZORATH_EMPTY_ASCENDANCIES.has(a.id))
    .map((a) => a.id);
}

function applyJewel(jewelId: number) {
  emit("update:selectedJewel", jewelId);
  const next = getData().TimelessJewelConquerors[jewelId] ?? {};
  const first = Object.keys(next)[0] ?? "";
  emit("update:selectedConqueror", first);
  if (jewelId === 11) {
    const classIdx = props.classStartIndex || 1;
    emit("update:classStartIndex", classIdx);
    const ids = ascendancyIdsForClass(classIdx);
    if (!ids.includes(props.ascendancyName)) {
      emit("update:ascendancyName", ids[0] ?? "");
    }
  }
  changeJewel();
}

function onClassChange(v: string | number) {
  const idx = Number(v);
  emit("update:classStartIndex", idx);
  const ids = ascendancyIdsForClass(idx);
  emit("update:ascendancyName", ids[0] ?? "");
  updateUrl();
}

function onAscendancyChange(v: string | number) {
  emit("update:ascendancyName", String(v));
  updateUrl();
}

function changeJewelFamily(family: string | number) {  const f = String(family) === "abyss" ? "abyss" : "timeless";
  if (jewelFamily.value === f) return;
  const ids = Object.keys(getData().TimelessJewels)
    .map(Number)
    .filter((id) => (f === "abyss" ? id >= 7 : id < 7))
    .sort((a, b) => a - b);
  applyJewel(ids[0] ?? (f === "abyss" ? 7 : 1));
}

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
  classStartIndex: () => props.classStartIndex,
  ascendancyName: () => props.ascendancyName,
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
  updateUrl();
}
function selectAllNotables() {
  const notables = notableIds.value;
  const notablesSet = new Set(notables);
  const next = isAllNotablesSelected.value
    ? [...props.disabled, ...notables]
    : props.disabled.filter((id) => !notablesSet.has(id));
  emit("update:disabled", next);
  updateUrl();
}
function selectAllPassives() {
  const passives = passiveIds.value;
  const passivesSet = new Set(passives);
  const next = isAllPassivesSelected.value
    ? [...props.disabled, ...passives]
    : props.disabled.filter((id) => !passivesSet.has(id));
  emit("update:disabled", next);
  updateUrl();
}
function deselectAll() {
  emit("update:disabled", [...allAffectedSkillIds.value]);
  updateUrl();
}
function resetNodes() {
  emit("update:disabled", []);
  emit("update:highlighted", []);
  updateUrl();
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
      class="themed absolute top-0 left-0 z-40 max-h-screen w-[min(100vw-1rem,22.5rem)] overflow-x-hidden overflow-y-auto rounded-br-xl border border-surface-border bg-surface/95 shadow-surface backdrop-blur-md md:w-[36rem] lg:w-[40rem] xl:w-[42rem]"
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
            >{{ ui("jewelFamily", lang) }}</label
          >
          <div
            class="mb-4 flex rounded-lg border border-surface-border/30 bg-black/25 p-0.5"
            role="tablist"
          >
            <button
              v-for="opt in jewelFamilyOptions"
              :key="opt.value"
              type="button"
              role="tab"
              class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
              :class="
                jewelFamily === opt.value
                  ? 'bg-white/12 text-heading shadow-sm'
                  : 'text-muted hover:text-white'
              "
              :aria-selected="jewelFamily === opt.value"
              @click="changeJewelFamily(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <label
            class="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
            >{{ ui("jewel", lang) }}</label
          >
          <AppSelect
            :model-value="selectedJewel"
            :options="familyJewels"
            class="w-full"
            @update:model-value="
              (v: string | number) => {
                applyJewel(Number(v));
              }
            "
          />

          <div v-if="selectedJewel && showConquerorSelect" class="mt-5">
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
            v-else-if="selectedJewel && isAbyssJewel && selectedConqueror"
            class="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm"
          >
            <span class="text-xs font-medium uppercase tracking-wide text-muted">{{
              ui("lich", lang)
            }}</span>
            <span class="text-heading/90">
              {{
                conquerors.find((c) => c.value === selectedConqueror)?.label ??
                selectedConqueror
              }}
            </span>
          </div>

          <template v-if="isZorathJewel">
            <div class="mt-5">
              <label
                class="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
              >
                {{ ui("characterClass", lang) }}
              </label>
              <AppSelect
                :model-value="classStartIndex"
                :options="classOptions"
                class="w-full"
                @update:model-value="onClassChange"
              />
            </div>
            <div v-if="ascendancyOptions.length" class="mt-5">
              <label
                class="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
              >
                {{ ui("ascendancy", lang) }}
              </label>
              <AppSelect
                :model-value="ascendancyName"
                :options="ascendancyOptions"
                class="w-full"
                @update:model-value="onAscendancyChange"
              />
            </div>
          </template>

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

            <button
              v-if="disabled.length > 0 || highlighted.length > 0"
              type="button"
              class="mt-2 w-full rounded-md border border-surface-border/25 bg-white/5 px-3 py-2 text-sm text-muted transition-colors hover:border-accent/35 hover:bg-accent/10 hover:text-accent-muted"
              @click="resetNodes"
            >
              {{ ui("resetNodes", lang) }}
              <span v-if="disabled.length" class="tabular-nums opacity-70">
                · {{ disabled.length }}
              </span>
            </button>

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
              :class-start-index="classStartIndex"
              :ascendancy-name="ascendancyName"
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

    <MenuBurgerButton
      v-else
      :open="false"
      label="Open menu"
      class="absolute top-0 left-0 z-40 rounded-none rounded-br-xl border-surface-border/30 bg-surface/95 px-3.5 py-3.5 shadow-surface backdrop-blur-md hover:bg-surface"
      @click="collapsed = false"
    />
  </div>
</template>
