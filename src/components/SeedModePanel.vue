<script setup lang="ts">
import { ref } from "vue";
import { statValues } from "@/lib/values";
import { ui } from "@/lib/dict";
import type { Lang } from "@/lib/i18n";
import { useSeedPreview } from "@/composables/useSeedPreview";
import AppSelect from "./AppSelect.vue";
import AppInput from "./AppInput.vue";

const props = defineProps<{
  lang: Lang;
  seed: number;
  seedValid: boolean;
  seedTouched: boolean;
  circledNode: number | undefined;
  selectedJewel: number;
  selectedConqueror: string;
  highlighted: number[];
}>();

const emit = defineEmits<{
  "update:seed": [v: number];
  highlight: [seed: number, passives: number[]];
  seedBlur: [];
}>();

const split = ref(true);

const {
  sortOrder,
  jewelFlavorLines,
  combinedAll,
  combinedNotables,
  combinedPassives,
  isHighlightedItem,
} = useSeedPreview({
  lang: () => props.lang,
  seed: () => props.seed,
  circledNode: () => props.circledNode,
  selectedJewel: () => props.selectedJewel,
  selectedConqueror: () => props.selectedConqueror,
  highlighted: () => props.highlighted,
});

const sortOptions = [
  { label: ui("sortCount", props.lang), value: "count" as const },
  { label: ui("sortAlphabet", props.lang), value: "alphabet" as const },
  { label: ui("sortRarity", props.lang), value: "rarity" as const },
  { label: ui("sortValue", props.lang), value: "value" as const },
];

function onSeedInput(v: string | number) {
  const n = Number(v);
  emit("update:seed", Number.isNaN(n) ? 0 : n);
}
</script>

<template>
  <div class="mt-5">
    <h3 class="mb-2 text-sm font-semibold text-heading">{{ ui("seed", lang) }}</h3>
    <AppInput
      :model-value="seed"
      type="number"
      class="w-full"
      @update:model-value="onSeedInput($event)"
      @blur="emit('seedBlur')"
    />
    <p
      v-if="jewelFlavorLines.length"
      class="mt-3 text-sm leading-relaxed italic"
      :class="seedTouched && !seedValid ? 'text-red-400' : 'text-muted'"
    >
      <template v-for="(line, i) in jewelFlavorLines" :key="i">
        {{ line }}
        <br v-if="i < jewelFlavorLines.length - 1" />
      </template>
    </p>

    <template v-if="seedValid">
      <div class="mt-4 flex flex-row items-end gap-2">
        <div class="min-w-0 flex-grow">
          <h3 class="mb-2 text-sm font-semibold text-heading">{{ ui("sortOrder", lang) }}</h3>
          <AppSelect
            v-model="sortOrder"
            :options="sortOptions"
            class="w-full"
          />
        </div>
        <div class="ml-2">
          <button
            type="button"
            class="rounded-md border border-surface-border/25 px-3 py-2.5 text-sm transition-colors"
            :class="
              split
                ? 'border-accent/35 bg-accent/15 text-accent-muted'
                : 'bg-white/5 text-muted hover:bg-white/10 hover:text-white'
            "
            @click="split = !split"
          >
            {{ ui("split", lang) }}
          </button>
        </div>
      </div>

      <ul v-if="!split" class="mt-3 max-h-[50vh] space-y-0.5 overflow-y-auto rounded-md border border-surface-border/20 bg-black/20 p-1">
        <li
          v-for="r in combinedAll"
          :key="r.id"
          class="cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/8"
          :class="{
            'border-l-2 border-accent bg-accent/15': isHighlightedItem(r.passives),
          }"
          @click="emit('highlight', seed, r.passives)"
        >
          <span
            class="font-bold"
            :class="{
              'text-white': (statValues[parseInt(r.id)] ?? 0) < 3,
            }"
            >({{ r.passives.length }})</span
          >
          <span class="text-white">{{ r.rawStat }}</span>
        </li>
      </ul>
      <div v-else class="mt-3 max-h-[50vh] space-y-3 overflow-y-auto pr-0.5">
        <template v-if="combinedNotables.length">
          <h3 class="text-xs font-medium uppercase tracking-wide text-muted">{{ ui("notablesTitle", lang) }}</h3>
          <ul class="space-y-0.5 rounded-md border border-surface-border/20 bg-black/20 p-1">
            <li
              v-for="r in combinedNotables"
              :key="'n-' + r.id"
              class="cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/8"
              :class="{
                'border-l-2 border-accent bg-accent/15': isHighlightedItem(r.passives),
              }"
              @click="emit('highlight', seed, r.passives)"
            >
              <span
                class="font-bold"
                :class="{
                  'text-white': (statValues[parseInt(r.id)] ?? 0) < 3,
                }"
              >
                ({{ r.passives.length }})
              </span>
              <span class="text-white">{{ r.rawStat }}</span>
            </li>
          </ul>
        </template>
        <template v-if="combinedPassives.length">
          <h3
            class="text-xs font-medium uppercase tracking-wide text-muted"
            :class="{ 'mt-1': combinedNotables.length }"
          >
            {{ ui("smallsTitle", lang) }}
          </h3>
          <ul class="space-y-0.5 rounded-md border border-surface-border/20 bg-black/20 p-1">
            <li
              v-for="r in combinedPassives"
              :key="'p-' + r.id"
              class="cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/8"
              :class="{
                'border-l-2 border-accent bg-accent/15': isHighlightedItem(r.passives),
              }"
              @click="emit('highlight', seed, r.passives)"
            >
              <span
                class="font-bold"
                :class="{
                  'text-white': (statValues[parseInt(r.id)] ?? 0) < 3,
                }"
              >
                ({{ r.passives.length }})
              </span>
              <span class="text-white">{{ r.rawStat }}</span>
            </li>
          </ul>
        </template>
      </div>
    </template>
  </div>
</template>
