<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import SkillTreeCanvas from "@/components/SkillTreeCanvas.vue";
import TreeMenu from "@/components/TreeMenu.vue";
import TreeNav from "@/components/TreeNav.vue";
import { loadWasm, isWasmReady } from "@/services/wasmDataService";
import { loadUiData } from "@/lib/uiData";
import { ensureEnDictMaps, ui } from "@/lib/dict";
import { loadSkillTree } from "@/lib/skill_tree";
import type { Node } from "@/lib/skill_tree_types";
import { getLanguage } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { loadTreePrefs, saveTreePrefs } from "@/lib/treePrefs";

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const lang = ref<Lang>(getLanguage());
const error = ref<string | null>(null);
const circledNode = ref<number | undefined>();
const selectedJewel = ref(1);
const selectedConqueror = ref("Ahuana");
const seed = ref(0);
const highlighted = ref<number[]>([]);
const disabled = ref<number[]>([]);
const highlightJewels = ref(false);
const classStartIndex = ref(1);
const ascendancyName = ref("Juggernaut");
const treeMenuRef = ref<{ openForSeedEntry: () => void } | null>(null);
const menuCollapsed = ref(false);
const startGuideHidden = ref(
  typeof localStorage !== "undefined" &&
    localStorage.getItem("poe-hide-start-guide") === "1",
);

const needsSeedHint = computed(
  () =>
    !startGuideHidden.value &&
    circledNode.value != null &&
    !(seed.value > 0) &&
    menuCollapsed.value,
);

/** Примеры для пустого экрана (большие сокеты). */
const TREE_EXAMPLES = [
  {
    key: "exampleLp" as const,
    query: { jewel: "2", conqueror: "Kaom", location: "55190" },
  },
  {
    key: "exampleMf" as const,
    query: { jewel: "4", conqueror: "Dominus", location: "2491" },
  },
  {
    key: "exampleAbyss" as const,
    query: { jewel: "7", conqueror: "Tecrod", location: "7960" },
  },
];

function readQuery() {
  const q = route.query;
  if (q.jewel) selectedJewel.value = Number(q.jewel);
  if (q.conqueror) selectedConqueror.value = String(q.conqueror);
  if (q.seed) seed.value = Number(q.seed);
  if (q.location) circledNode.value = Number(q.location);
  if (q.class != null) classStartIndex.value = Number(q.class);
  if (q.asc) ascendancyName.value = String(q.asc);
  if (q.disabled)
    disabled.value = Array.isArray(q.disabled)
      ? q.disabled.map(Number)
      : [Number(q.disabled)];
  if (q.highlighted)
    highlighted.value = Array.isArray(q.highlighted)
      ? q.highlighted.map(Number)
      : [Number(q.highlighted)];
}

/** Поля без query — из localStorage (язык уже в i18n). */
function applyPrefsFallback() {
  const q = route.query;
  const prefs = loadTreePrefs();
  if (!q.jewel && prefs.jewel != null) selectedJewel.value = prefs.jewel;
  if (!q.conqueror && prefs.conqueror)
    selectedConqueror.value = prefs.conqueror;
  if (!q.location && prefs.location != null) {
    circledNode.value = prefs.location;
    highlightJewels.value = true;
  }
  if (q.class == null && prefs.classStartIndex != null)
    classStartIndex.value = prefs.classStartIndex;
  if (!q.asc && prefs.ascendancyName)
    ascendancyName.value = prefs.ascendancyName;
}

function updateUrl() {
  const q: Record<string, string | string[]> = {};
  if (selectedJewel.value) q.jewel = String(selectedJewel.value);
  if (selectedConqueror.value) q.conqueror = selectedConqueror.value;
  if (seed.value) q.seed = String(seed.value);
  if (circledNode.value != null) q.location = String(circledNode.value);
  if (selectedJewel.value === 11) {
    q.class = String(classStartIndex.value);
    if (ascendancyName.value) q.asc = ascendancyName.value;
  }
  disabled.value.forEach((d) => {
    if (!q.disabled) q.disabled = [];
    (q.disabled as string[]).push(String(d));
  });
  highlighted.value.forEach((h) => {
    if (!q.highlighted) q.highlighted = [];
    (q.highlighted as string[]).push(String(h));
  });
  router.replace({ path: route.path, query: q });
}

function persistPrefs() {
  saveTreePrefs({
    jewel: selectedJewel.value,
    conqueror: selectedConqueror.value,
    location: circledNode.value,
    classStartIndex: classStartIndex.value,
    ascendancyName: ascendancyName.value,
  });
}

function onClickNode(node: Node) {
  if (node.isJewelSocket) {
    circledNode.value = node.skill;
    highlightJewels.value = true;
    updateUrl();
  } else if (!node.isMastery && node.skill != null) {
    const idx = disabled.value.indexOf(node.skill);
    if (idx >= 0) disabled.value = disabled.value.filter((_, i) => i !== idx);
    else disabled.value = [...disabled.value, node.skill];
    updateUrl();
  }
}

function onHighlight(newSeed: number, passives: number[]) {
  seed.value = newSeed;
  highlighted.value = passives;
}

function openExample(query: Record<string, string>) {
  router.replace({ path: "/tree", query });
}

onMounted(async () => {
  try {
    // WASM (calc) и UI-данные (дерево/переводы/possible_stats) — параллельно.
    await Promise.all([loadWasm(), loadUiData()]);
    if (!isWasmReady()) throw new Error("WASM not ready after load");
    await loadSkillTree();
    readQuery();
    applyPrefsFallback();
    lang.value = getLanguage();
    // EN-словари отдельным чанком: при EN ждём, при RU греем в фоне (skeleton→id для фоллбеков).
    if (lang.value === "en") await ensureEnDictMaps();
    else void ensureEnDictMaps();
    if (circledNode.value != null && !route.query.location) updateUrl();
    loading.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    loading.value = false;
  }
});

watch(lang, (next) => {
  if (next === "en") void ensureEnDictMaps();
});

watch(
  [
    selectedJewel,
    selectedConqueror,
    circledNode,
    classStartIndex,
    ascendancyName,
  ],
  persistPrefs,
);

watch(() => route.query, readQuery, { deep: true });
</script>

<template>
  <div class="tree-view text-heading font-celtes">
    <div v-if="loading" class="loading">
      <h1>{{ ui("loadingTitle", lang) }}</h1>
      <p>{{ ui("loadingHint", lang) }}</p>
    </div>
    <div v-else-if="error" class="error">
      <h1>{{ ui("errorTitle", lang) }}</h1>
      <p>{{ error }}</p>
      <p class="hint">{{ ui("errorHint", lang) }}</p>
      <RouterLink to="/">{{ ui("backHome", lang) }}</RouterLink>
    </div>
    <template v-else>
      <div class="tree-content">
        <SkillTreeCanvas
          :circled-node="circledNode"
          :selected-jewel="selectedJewel"
          :selected-conqueror="selectedConqueror"
          :seed="seed"
          :highlighted="highlighted"
          :disabled="disabled"
          :highlight-jewels="highlightJewels || circledNode == null"
          :class-start-index="classStartIndex"
          :ascendancy-name="ascendancyName"
          :lang="lang"
          @click-node="onClickNode"
        />

        <div
          v-if="circledNode == null"
          class="empty-tree-hint pointer-events-none absolute inset-x-0 bottom-[5.75rem] z-[45] flex justify-center px-3 md:bottom-auto md:top-[22%] md:px-6"
          data-tree-empty-hint
        >
          <div
            class="pointer-events-auto max-w-md rounded-xl border border-heading/35 bg-black/80 px-4 py-3.5 shadow-lg backdrop-blur-md"
          >
            <h2 class="font-celtes text-heading text-base mb-1">
              {{ ui("emptyTreeTitle", lang) }}
            </h2>
            <p class="text-sm text-gray-300 mb-3">
              {{ ui("emptyTreeHint", lang) }}
            </p>
            <div class="flex flex-col gap-2">
              <button
                v-for="ex in TREE_EXAMPLES"
                :key="ex.key"
                type="button"
                class="cursor-pointer rounded-md border border-heading/30 bg-heading/10 px-3 py-2 text-left text-sm text-heading transition-colors hover:border-heading/55 hover:bg-heading/20"
                @click="openExample(ex.query)"
              >
                {{ ui(ex.key, lang) }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-else-if="needsSeedHint"
          class="empty-tree-hint pointer-events-none absolute inset-x-0 bottom-[5.75rem] z-[45] flex justify-center px-3 md:bottom-auto md:top-[22%] md:px-6"
          data-tree-empty-hint
        >
          <div
            class="pointer-events-auto max-w-md rounded-xl border border-heading/35 bg-black/80 px-4 py-3.5 shadow-lg backdrop-blur-md"
          >
            <h2 class="font-celtes text-heading text-base mb-1">
              {{ ui("nextStepTitle", lang) }}
            </h2>
            <p class="text-sm text-gray-300 mb-3">
              {{ ui("nextStepHint", lang) }}
            </p>
            <button
              type="button"
              class="w-full cursor-pointer rounded-md border border-heading/40 bg-heading/15 px-3 py-2.5 text-sm text-heading transition-colors hover:border-heading/60 hover:bg-heading/25"
              @click="treeMenuRef?.openForSeedEntry()"
            >
              {{ ui("nextStepOpenMenu", lang) }}
            </button>
            <button
              type="button"
              class="mt-2 w-full cursor-pointer rounded-md px-2 py-1.5 text-xs text-gray-400 transition-colors hover:text-heading"
              @click="
                startGuideHidden = true;
                try {
                  localStorage.setItem('poe-hide-start-guide', '1');
                } catch {
                  /* ignore */
                }
              "
            >
              {{ ui("guideDismiss", lang) }}
            </button>
          </div>
        </div>

        <TreeMenu
          ref="treeMenuRef"
          :lang="lang"
          :circled-node="circledNode"
          :disabled="disabled"
          :selected-jewel="selectedJewel"
          :selected-conqueror="selectedConqueror"
          :seed="seed"
          :highlighted="highlighted"
          :class-start-index="classStartIndex"
          :ascendancy-name="ascendancyName"
          @update:selected-jewel="selectedJewel = $event"
          @update:selected-conqueror="selectedConqueror = $event"
          @update:seed="seed = $event"
          @update:highlighted="highlighted = $event"
          @update:disabled="disabled = $event"
          @update:class-start-index="classStartIndex = $event"
          @update:ascendancy-name="ascendancyName = $event"
          @update:collapsed="menuCollapsed = $event"
          @guide-dismissed="startGuideHidden = true"
          @update-url="updateUrl"
        />
        <TreeNav v-model:lang="lang" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.tree-view {
  width: 100%;
  max-width: 100%;
  /* Не height:100% — у App только min-h-screen, % схлопывается в 0. */
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #171717;
}
.tree-content {
  position: relative;
  width: 100%;
  height: 100%;
  isolation: isolate;
  overflow: hidden;
}
.tree-content :deep(.tree-menu-root) {
  position: absolute;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}
.tree-content :deep(.tree-menu-root > *) {
  pointer-events: auto;
}

.loading,
.error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  gap: 1rem;
  text-align: center;
  padding: 1.5rem;
  box-sizing: border-box;
}
.error {
  color: #f88;
}
.hint {
  font-size: 0.9rem;
  opacity: 0.8;
  max-width: 480px;
  text-align: center;
}
.error a {
  color: #42b883;
}
</style>
