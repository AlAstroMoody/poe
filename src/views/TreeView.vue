<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import SkillTreeCanvas from "@/components/SkillTreeCanvas.vue";
import TreeMenu from "@/components/TreeMenu.vue";
import TreeNav from "@/components/TreeNav.vue";
import { loadWasm, isWasmReady } from "@/services/wasmDataService";
import { loadSkillTree } from "@/lib/skill_tree";
import type { Node } from "@/lib/skill_tree_types";
import { getLanguage } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

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

function readQuery() {
  const q = route.query;
  if (q.jewel) selectedJewel.value = Number(q.jewel);
  if (q.conqueror) selectedConqueror.value = String(q.conqueror);
  if (q.seed) seed.value = Number(q.seed);
  if (q.location) circledNode.value = Number(q.location);
  if (q.disabled)
    disabled.value = Array.isArray(q.disabled)
      ? q.disabled.map(Number)
      : [Number(q.disabled)];
  if (q.highlighted)
    highlighted.value = Array.isArray(q.highlighted)
      ? q.highlighted.map(Number)
      : [Number(q.highlighted)];
}

function updateUrl() {
  const q: Record<string, string | string[]> = {};
  if (selectedJewel.value) q.jewel = String(selectedJewel.value);
  if (selectedConqueror.value) q.conqueror = selectedConqueror.value;
  if (seed.value) q.seed = String(seed.value);
  if (circledNode.value != null) q.location = String(circledNode.value);
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

onMounted(async () => {
  try {
    await loadWasm();
    if (!isWasmReady()) throw new Error("WASM not ready after load");
    await loadSkillTree();
    readQuery();
    lang.value = getLanguage();
    loading.value = false;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    loading.value = false;
  }
});

watch(() => route.query, readQuery, { deep: true });
</script>

<template>
  <div class="tree-view text-heading font-celtes">
    <div v-if="loading" class="loading">
      <h1>Уже почти готово</h1>
      <p>Подгружаем данные…</p>
    </div>
    <div v-else-if="error" class="error">
      <h1>Внезапная ошибка</h1>
      <p>{{ error }}</p>
      <p class="hint">пу-пу-пу</p>
      <RouterLink to="/">На главную</RouterLink>
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
          :highlight-jewels="highlightJewels"
          :lang="lang"
          @click-node="onClickNode"
        />
        <TreeMenu
          :lang="lang"
          :circled-node="circledNode"
          :disabled="disabled"
          :selected-jewel="selectedJewel"
          :selected-conqueror="selectedConqueror"
          :seed="seed"
          :highlighted="highlighted"
          @update:selected-jewel="selectedJewel = $event"
          @update:selected-conqueror="selectedConqueror = $event"
          @update:seed="seed = $event"
          @update:highlighted="highlighted = $event"
          @update:disabled="disabled = $event"
          @update-url="updateUrl"
        />
        <TreeNav v-model:lang="lang" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.tree-view {
  width: 100vw;
  height: 100vh;
  background: #171717;
}
.tree-content {
  position: relative;
  width: 100%;
  height: 100%;
  isolation: isolate;
}
.tree-content :deep(.canvas-wrap) {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
}
.tree-content :deep(.tree-menu-root) {
  position: absolute;
  top: 0;
  left: 0;
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
  height: 100%;
  gap: 1rem;
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
