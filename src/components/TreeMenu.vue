<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { getData, getCalculator } from "@/services/wasmDataService";
import {
  getAffectedNodes,
  getStat,
  skillTree,
  translateStat,
  runReverseSearch,
  combineResults,
  sortCombined,
  openTrade,
  type StatConfig,
  type SearchResults,
} from "@/lib/skill_tree";
import { statValues } from "@/lib/values";
import type { Lang } from "@/lib/i18n";
import {
  jewelLabel,
  conquerorLabel,
  statLabelByStringId,
  ui,
  getJewelFlavorLines,
} from "@/lib/dict";
import SearchResultsList from "./SearchResultsList.vue";
import AppSelect from "./AppSelect.vue";
import AppInput from "./AppInput.vue";

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

const data = getData();

const jewels = computed(() =>
  Object.keys(data.TimelessJewels).map((k) => {
    const id = Number(k);
    const enLabel = data.TimelessJewels[id];
    return { value: id, label: jewelLabel(id, enLabel, props.lang) };
  }),
);

const conquerors = computed(() => {
  if (!props.selectedJewel) return [];
  const conq = data.TimelessJewelConquerors[props.selectedJewel];
  if (!conq) return [];
  return Object.keys(conq).map((k) => ({
    value: k,
    label: conquerorLabel(k, props.lang),
  }));
});

const affectedNodes = computed(() => {
  if (!props.circledNode || !skillTree?.nodes[props.circledNode]) return [];
  return getAffectedNodes(skillTree.nodes[props.circledNode]).filter(
    (n) => !n.isJewelSocket && !n.isMastery,
  );
});

const seedRanges = computed(
  () => data.TimelessJewelSeedRanges[props.selectedJewel],
);
const seedValid = computed(() => {
  const r = seedRanges.value;
  if (!r) return false;
  return props.seed >= r.Min && props.seed <= r.Max;
});

const seedResults = computed(() => {
  if (
    !props.seed ||
    !props.selectedJewel ||
    !props.selectedConqueror ||
    !conquerors.value.some((c) => c.value === props.selectedConqueror)
  )
    return [];
  const calc = getCalculator();
  return affectedNodes.value
    .filter((n) => n.skill != null && data.TreeToPassive[n.skill])
    .map((n) => ({
      node: n.skill!,
      result: calc.Calculate(
        data.TreeToPassive[n.skill!]!.Index,
        props.seed,
        props.selectedJewel,
        props.selectedConqueror,
      ),
    }))
    .filter(
      (x): x is { node: number; result: NonNullable<typeof x.result> } =>
        x.result != null,
    );
});

const mode = ref<"seed" | "stats">("seed");
const selectedStats = ref<Record<number, StatConfig>>({});
const allPossibleStats = computed(() =>
  props.selectedJewel
    ? (JSON.parse(data.PossibleStats) as Record<number, Record<string, number>>)
    : {},
);
const availableStats = computed(() => {
  if (!props.selectedJewel) return [];
  const keys = Object.keys(allPossibleStats.value[props.selectedJewel] ?? {});
  return keys
    .map((statId) => {
      const id = Number(statId);
      const enLabel = translateStat(id);
      const stringId = getStat(id).ID;
      return {
        label: statLabelByStringId(stringId, enLabel, props.lang),
        value: id,
      };
    })
    .filter((s) => !(s.value in selectedStats.value));
});
const minTotalWeight = ref(0);
const searching = ref(false);
const currentSeed = ref(0);
const searchResults = ref<SearchResults | null>(null);
const showResults = ref(false);
const groupResults = ref(true);
const sortOrder = ref<"count" | "alphabet" | "rarity" | "value">("count");
const colored = ref(true);
const split = ref(true);
const collapsed = ref(false);
const platform = ref(localStorage.getItem("platform") || "PC");
const league = ref(localStorage.getItem("league") || "Standard");
const leagues = ref<{ value: string; label: string }[]>([]);
const expandedGroup = ref<number | "">("");
const addStatValue = ref<string | number>("");

function updateUrl() {
  emit("update-url");
}
const seedTouched = ref(false);
function onSeedInput(v: string | number) {
  seedTouched.value = true;
  const n = Number(v);
  emit("update:seed", Number.isNaN(n) ? 0 : n);
}
function onSeedBlur() {
  updateUrl();
}
function setMode(m: "seed" | "stats") {
  mode.value = m;
  updateUrl();
}
function changeJewel() {
  selectedStats.value = {};
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
async function search() {
  if (!props.circledNode) return;
  searching.value = true;
  searchResults.value = null;
  const config = {
    jewel: props.selectedJewel,
    conqueror: props.selectedConqueror,
    nodes: affectedNodes.value
      .filter((n) => !props.disabled.includes(n.skill!))
      .map((n) => data.TreeToPassive[n.skill!]?.Index)
      .filter((x): x is number => x != null),
    stats: Object.values(selectedStats.value),
    minTotalWeight: minTotalWeight.value,
  };
  try {
    const result = await runReverseSearch(
      config,
      (s) => (currentSeed.value = s),
    );
    searchResults.value = result;
    showResults.value = true;
  } finally {
    searching.value = false;
  }
}
function highlight(newSeed: number, passives: number[]) {
  emit("update:seed", newSeed);
  emit("update:highlighted", passives);
  updateUrl();
}

function isHighlightedItem(passives: number[]) {
  if (props.highlighted.length !== passives.length) return false;
  const a = [...props.highlighted].sort((x, y) => x - y);
  const b = [...passives].sort((x, y) => x - y);
  return a.every((v, i) => v === b[i]);
}
const allAffectedSkillIds = computed(() =>
  affectedNodes.value
    .filter((n) => !n.isJewelSocket && !n.isMastery)
    .map((n) => n.skill!),
);
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

const isAllSelected = computed(() => props.disabled.length === 0);
const notableIds = computed(() =>
  affectedNodes.value.filter((n) => n.isNotable).map((n) => n.skill!),
);
const passiveIds = computed(() =>
  affectedNodes.value.filter((n) => !n.isNotable).map((n) => n.skill!),
);
const isAllNotablesSelected = computed(
  () =>
    notableIds.value.length > 0 &&
    notableIds.value.every((id) => !props.disabled.includes(id)),
);
const isAllPassivesSelected = computed(
  () =>
    passiveIds.value.length > 0 &&
    passiveIds.value.every((id) => !props.disabled.includes(id)),
);

const combinedAll = computed(() =>
  seedValid.value
    ? sortCombined(
        combineResults(
          seedResults.value,
          colored.value,
          "all",
          props.selectedJewel,
        ),
        sortOrder.value,
        props.selectedJewel,
      )
    : [],
);
const combinedNotables = computed(() =>
  seedValid.value
    ? sortCombined(
        combineResults(
          seedResults.value,
          colored.value,
          "notables",
          props.selectedJewel,
        ),
        sortOrder.value,
        props.selectedJewel,
      )
    : [],
);
const combinedPassives = computed(() =>
  seedValid.value
    ? sortCombined(
        combineResults(
          seedResults.value,
          colored.value,
          "passives",
          props.selectedJewel,
        ),
        sortOrder.value,
        props.selectedJewel,
      )
    : [],
);

const sortOptions = computed(() => [
  { label: ui("sortCount", props.lang), value: "count" as const },
  { label: ui("sortAlphabet", props.lang), value: "alphabet" as const },
  { label: ui("sortRarity", props.lang), value: "rarity" as const },
  { label: ui("sortValue", props.lang), value: "value" as const },
]);

const jewelFlavorLines = computed(() =>
  seedRanges.value
    ? getJewelFlavorLines(
        props.selectedJewel,
        seedRanges.value.Min,
        seedRanges.value.Max,
        props.selectedConqueror,
        props.lang,
      )
    : [],
);

fetch("https://api.poe.watch/leagues")
  .then((r) => r.json())
  .then((arr: { name: string }[]) => {
    leagues.value = arr.map((l) => ({ value: l.name, label: l.name }));
    const saved = localStorage.getItem("league");
    if (saved && leagues.value.some((l) => l.value === saved))
      league.value = saved;
  })
  .catch(() => {});

watch(platform, () => localStorage.setItem("platform", platform.value));
watch(league, () => localStorage.setItem("league", league.value));
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
      class="w-screen md:w-10/12 lg:w-2/3 xl:w-1/2 2xl:w-5/12 3xl:w-1/3 4xl:w-1/4 min-w-[820px] absolute top-0 left-0 bg-black/80 backdrop-blur-sm themed rounded-br-lg max-h-screen overflow-hidden"
    >
      <div
        v-if="searching"
        class="absolute inset-0 z-50 flex items-center justify-center bg-black/70 rounded-br-lg"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          class="size-10 shrink-0 rounded-full border-4 border-current border-t-transparent animate-spin"
          aria-hidden
        />
      </div>
      <div class="p-4 max-h-screen flex flex-col relative">
        <div class="flex flex-row justify-between items-center mb-2">
          <div class="flex flex-row items-center gap-2 flex-grow min-w-0">
            <h3 class="flex-grow truncate">
              {{
                showResults && searchResults
                  ? ui("results", lang)
                  : ui("title", lang)
              }}
            </h3>
          </div>
          <div class="flex flex-row items-center gap-2 shrink-0">
            <div v-if="searchResults" class="flex flex-row gap-2">
              <template v-if="showResults">
                <AppSelect
                  v-model="league"
                  :options="leagues"
                  class="p-1 px-3 text-sm min-w-[80px] max-w-[100px] truncate"
                />
                <AppSelect
                  v-model="platform"
                  :options="[
                    { value: 'PC', label: 'PC' },
                    { value: 'Xbox', label: 'Xbox' },
                    { value: 'Playstation', label: 'Playstation' },
                  ]"
                  class="p-1 px-3 text-sm min-w-[80px]"
                />
                <button
                  type="button"
                  class="p-1 px-3 bg-blue-500/40 rounded disabled:bg-blue-900/40"
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
                  class="p-1 px-3 bg-blue-500/40 rounded disabled:bg-blue-900/40"
                  :class="{ grouped: groupResults }"
                  :disabled="!searchResults"
                  @click="groupResults = !groupResults"
                >
                  {{ ui("grouped", lang) }}
                </button>
              </template>
              <button
                type="button"
                class="bg-neutral-100/20 px-4 p-1 rounded"
                @click="showResults = !showResults"
              >
                {{ showResults ? ui("config", lang) : ui("results", lang) }}
              </button>
            </div>
            <button
              type="button"
              class="ml-1 flex flex-col justify-center gap-1 border-none bg-transparent cursor-pointer p-1 text-inherit"
              aria-label="Collapse"
              @click="collapsed = true"
            >
              <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
              <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
              <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
            </button>
          </div>
        </div>

        <template v-if="!showResults">
          <label class="block mb-1 text-sm">{{ ui("jewel", lang) }}</label>
          <AppSelect
            :model-value="selectedJewel"
            :options="jewels"
            class="w-full"
            @update:model-value="
              (v) => {
                emit('update:selectedJewel', Number(v));
                emit('update:selectedConqueror', '');
                changeJewel();
              }
            "
          />

          <template v-if="selectedJewel">
            <div class="mt-4">
              <label class="block mb-1 text-sm">
                {{ ui("conqueror", lang) }}
              </label>
              <AppSelect
                :model-value="selectedConqueror"
                :options="conquerors"
                :placeholder="ui('selectPlaceholder', lang)"
                class="w-full"
                @update:model-value="
                  (v) => {
                    emit('update:selectedConqueror', String(v));
                    updateUrl();
                  }
                "
              />
            </div>

            <template
              v-if="
                selectedConqueror &&
                conquerors.some((c) => c.value === selectedConqueror)
              "
            >
              <div class="mt-4 w-full flex flex-row">
                <button
                  type="button"
                  class="selection-button cursor-pointer"
                  :class="{ selected: mode === 'seed' }"
                  @click="setMode('seed')"
                >
                  {{ ui("enterSeed", lang) }}
                </button>
                <button
                  type="button"
                  class="selection-button cursor-pointer"
                  :class="{ selected: mode === 'stats' }"
                  @click="setMode('stats')"
                >
                  {{ ui("selectStats", lang) }}
                </button>
              </div>

              <template v-if="mode === 'seed'">
                <div class="mt-4">
                  <h3 class="mb-2">{{ ui("seed", lang) }}</h3>
                  <AppInput
                    :model-value="seed"
                    type="number"
                    class="w-full"
                    @update:model-value="onSeedInput($event)"
                    @blur="onSeedBlur()"
                  />
                  <p
                    v-if="jewelFlavorLines.length"
                    class="mt-3 text-sm leading-relaxed italic"
                    :class="
                      seedTouched && !seedValid
                        ? 'text-red-400'
                        : 'text-neutral-300'
                    "
                  >
                    <template v-for="(line, i) in jewelFlavorLines" :key="i">
                      {{ line }}
                      <br v-if="i < jewelFlavorLines.length - 1" />
                    </template>
                  </p>

                  <template v-if="seedValid">
                    <div class="flex flex-row mt-4 items-end">
                      <div class="flex-grow">
                        <h3 class="mb-2">{{ ui("sortOrder", lang) }}</h3>
                        <AppSelect
                          v-model="sortOrder"
                          :options="sortOptions"
                          class="w-full"
                        />
                      </div>
                      <div class="ml-2">
                        <button
                          type="button"
                          class="bg-neutral-500/20 p-2 px-4 rounded"
                          :class="{ selected: colored }"
                          @click="colored = !colored"
                        >
                          {{ ui("colors", lang) }}
                        </button>
                      </div>
                      <div class="ml-2">
                        <button
                          type="button"
                          class="bg-neutral-500/20 p-2 px-4 rounded"
                          :class="{ selected: split }"
                          @click="split = !split"
                        >
                          {{ ui("split", lang) }}
                        </button>
                      </div>
                    </div>

                    <ul
                      v-if="!split"
                      class="mt-4 overflow-y-auto max-h-[50vh]"
                      :class="{ rainbow: colored }"
                    >
                      <li
                        v-for="r in combinedAll"
                        :key="r.id"
                        class="cursor-pointer rounded px-1 -mx-1"
                        :class="{
                          'bg-neutral-500/40': isHighlightedItem(r.passives),
                        }"
                        @click="highlight(seed, r.passives)"
                      >
                        <span
                          class="font-bold"
                          :class="{
                            'text-white': (statValues[parseInt(r.id)] ?? 0) < 3,
                          }"
                          >({{ r.passives.length }})</span
                        >
                        <span class="text-white" v-html="r.stat"></span>
                      </li>
                    </ul>
                    <div v-else class="overflow-y-auto max-h-[50vh] mt-4 pr-1">
                      <template v-if="combinedNotables.length">
                        <h3>{{ ui("notablesTitle", lang) }}</h3>
                        <ul
                          class="mt-1 font-sans"
                          :class="{ rainbow: colored }"
                        >
                          <li
                            v-for="r in combinedNotables"
                            :key="'n-' + r.id"
                            class="cursor-pointer rounded px-1 -mx-1"
                            :class="{
                              'bg-neutral-500/40': isHighlightedItem(
                                r.passives,
                              ),
                            }"
                            @click="highlight(seed, r.passives)"
                          >
                            <span
                              class="font-bold"
                              :class="{
                                'text-white':
                                  (statValues[parseInt(r.id)] ?? 0) < 3,
                              }"
                            >
                              ({{ r.passives.length }})
                            </span>
                            <span class="text-white" v-html="r.stat"></span>
                          </li>
                        </ul>
                      </template>
                      <template v-if="combinedPassives.length">
                        <h3 :class="{ 'mt-2': combinedNotables.length }">
                          {{ ui("smallsTitle", lang) }}
                        </h3>
                        <ul
                          class="mt-1 font-sans"
                          :class="{ rainbow: colored }"
                        >
                          <li
                            v-for="r in combinedPassives"
                            :key="'p-' + r.id"
                            class="cursor-pointer rounded px-1 -mx-1"
                            :class="{
                              'bg-neutral-500/40': isHighlightedItem(
                                r.passives,
                              ),
                            }"
                            @click="highlight(seed, r.passives)"
                          >
                            <span
                              class="font-bold"
                              :class="{
                                'text-white':
                                  (statValues[parseInt(r.id)] ?? 0) < 3,
                              }"
                            >
                              ({{ r.passives.length }})
                            </span>
                            <span class="text-white" v-html="r.stat"></span>
                          </li>
                        </ul>
                      </template>
                    </div>
                  </template>
                </div>
              </template>

              <template v-else-if="mode === 'stats'">
                <div class="mt-4">
                  <h3 class="mb-2">{{ ui("addStat", lang) }}</h3>
                  <AppSelect
                    v-model="addStatValue"
                    :options="availableStats"
                    :placeholder="ui('selectPlaceholder', lang)"
                    class="w-full"
                  />
                </div>
                <div
                  v-if="Object.keys(selectedStats).length > 0"
                  class="mt-4 flex flex-col overflow-auto min-h-[100px]"
                >
                  <div
                    v-for="(stat, id) in selectedStats"
                    :key="id"
                    class="mb-4 flex items-start flex-col border border-neutral-100/40 border-b pb-4"
                  >
                    <div>
                      <button
                        type="button"
                        class="p-2 px-4 bg-red-500/40 rounded mr-2"
                        @click="removeStat(stat.id)"
                      >
                        −
                      </button>
                      <span>
                        {{
                          statLabelByStringId(
                            getStat(stat.id).ID,
                            translateStat(stat.id),
                            lang,
                          )
                        }}
                      </span>
                    </div>
                    <div class="mt-2 flex flex-row">
                      <div class="mr-4 flex flex-row items-center">
                        <div class="mr-2">{{ ui("min", lang) }}:</div>
                        <input
                          v-model.number="stat.min"
                          type="number"
                          min="0"
                          class="w-16 p-1 bg-neutral-700 rounded border-0 text-inherit"
                        />
                      </div>
                      <div class="flex flex-row items-center">
                        <div class="mr-2">{{ ui("weight", lang) }}:</div>
                        <input
                          v-model.number="stat.weight"
                          type="number"
                          min="0"
                          class="w-16 p-1 bg-neutral-700 rounded border-0 text-inherit"
                        />
                      </div>
                    </div>
                  </div>
                  <div class="flex flex-col mt-2">
                    <div class="flex flex-row items-center">
                      <div class="mr-2 min-w-fit">
                        {{ ui("minTotalWeight", lang) }}:
                      </div>
                      <input
                        v-model.number="minTotalWeight"
                        type="number"
                        min="0"
                        class="w-16 p-1 bg-neutral-700 rounded border-0 text-inherit"
                      />
                    </div>
                  </div>
                  <div class="flex flex-col mt-4">
                    <div class="flex flex-row">
                      <button
                        type="button"
                        class="p-2 px-2 rounded mr-2 cursor-pointer transition-colors disabled:bg-yellow-900/40"
                        :class="
                          isAllSelected
                            ? 'bg-yellow-900/50'
                            : 'bg-yellow-500/40'
                        "
                        :disabled="searching"
                        @click="selectAll"
                      >
                        {{ ui("selectAll", lang) }}
                      </button>
                      <button
                        type="button"
                        class="p-2 px-2 rounded mr-2 cursor-pointer transition-colors disabled:bg-yellow-900/40"
                        :class="
                          isAllNotablesSelected
                            ? 'bg-yellow-900/50'
                            : 'bg-yellow-500/40'
                        "
                        :disabled="searching"
                        @click="selectAllNotables"
                      >
                        {{ ui("notables", lang) }}
                      </button>
                      <button
                        type="button"
                        class="p-2 px-2 rounded mr-2 cursor-pointer transition-colors disabled:bg-yellow-900/40"
                        :class="
                          isAllPassivesSelected
                            ? 'bg-yellow-900/50'
                            : 'bg-yellow-500/40'
                        "
                        :disabled="searching"
                        @click="selectAllPassives"
                      >
                        {{ ui("passives", lang) }}
                      </button>
                      <button
                        type="button"
                        class="p-2 px-2 bg-yellow-500/40 rounded disabled:bg-yellow-900/40 flex-grow cursor-pointer"
                        :disabled="
                          searching || disabled.length >= affectedNodes.length
                        "
                        @click="deselectAll"
                      >
                        {{ ui("deselect", lang) }}
                      </button>
                    </div>
                    <div class="flex flex-row mt-2">
                      <button
                        type="button"
                        class="p-2 px-3 bg-green-500/40 rounded disabled:bg-green-900/40 flex-grow cursor-pointer inline-flex items-center justify-center gap-2 min-w-[10rem]"
                        :disabled="searching"
                        @click="search()"
                      >
                        <span
                          v-if="searching"
                          class="size-4 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
                          aria-hidden
                        />
                        <span class="min-w-0">{{ ui("search", lang) }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <h2 v-if="!circledNode" class="mt-4 text-amber-400">
                {{ ui("clickJewelSocket", lang) }}
              </h2>
            </template>
          </template>
        </template>

        <p
          v-if="
            showResults && (!searchResults || searchResults.raw.length === 0)
          "
          class="mt-4 text-muted"
        >
          {{ ui("noResults", lang) }}
        </p>

        <template
          v-if="showResults && searchResults && searchResults.raw.length > 0"
        >
          <SearchResultsList
            :search-results="searchResults"
            :group-results="groupResults"
            :jewel="selectedJewel"
            :conqueror="selectedConqueror"
            :platform="platform"
            :league="league"
            v-model:expanded-group="expandedGroup"
            @highlight="highlight"
          />
        </template>
      </div>
    </div>
    <button
      v-else
      type="button"
      class="absolute top-0 left-0 flex flex-col justify-center gap-1 border-none bg-black/80 cursor-pointer rounded-br-lg p-4 pt-5 text-inherit backdrop-blur-sm"
      aria-label="Open menu"
      @click="collapsed = false"
    >
      <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
      <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
      <span class="block h-0.5 w-5 rounded bg-current" aria-hidden />
    </button>
  </div>
</template>
