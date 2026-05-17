<script setup lang="ts">
import { getStat, translateStat, type StatConfig } from "@/lib/skill_tree";
import { statLabelByStringId, ui } from "@/lib/dict";
import type { Lang } from "@/lib/i18n";
import AppSelect from "./AppSelect.vue";
import AppInput from "./AppInput.vue";

const props = defineProps<{
  lang: Lang;
  statListFilter: string;
  filteredAvailableStats: { label: string; value: number }[];
  addStatValue: string | number;
  selectedStats: Record<number, StatConfig>;
  minTotalWeight: number;
  searching: boolean;
  disabled: number[];
  affectedNodesLength: number;
  isAllSelected: boolean;
  isAllNotablesSelected: boolean;
  isAllPassivesSelected: boolean;
}>();

const emit = defineEmits<{
  "update:statListFilter": [v: string];
  "update:addStatValue": [v: string | number];
  "update:minTotalWeight": [v: number];
  "update:selectedStats": [v: Record<number, StatConfig>];
  selectStat: [id: number];
  removeStat: [id: number];
  selectAll: [];
  selectAllNotables: [];
  selectAllPassives: [];
  deselectAll: [];
  search: [];
}>();

const chipBtn =
  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const numInput =
  "w-16 rounded-md border border-surface-border/25 bg-input-bg px-2 py-1.5 text-sm text-inherit outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/25";

function updateStatMin(id: number, value: unknown) {
  const next = { ...props.selectedStats };
  next[id] = { ...next[id], min: Number(value) || 0 };
  emit("update:selectedStats", next);
}

function updateStatWeight(id: number, value: unknown) {
  const next = { ...props.selectedStats };
  next[id] = { ...next[id], weight: Number(value) || 0 };
  emit("update:selectedStats", next);
}
</script>

<template>
  <div class="mt-5">
    <h3 class="mb-2 text-sm font-semibold text-heading">
      {{ ui("addStat", lang) }}
    </h3>
    <label class="sr-only" for="stat-list-filter">
      {{ ui("filterStatList", lang) }}
    </label>
    <AppInput
      id="stat-list-filter"
      :model-value="statListFilter"
      type="search"
      autocomplete="off"
      class="mb-2"
      :placeholder="ui('filterStatList', lang)"
      @update:model-value="(v) => emit('update:statListFilter', String(v))"
    />
    <p
      v-if="statListFilter.trim() && filteredAvailableStats.length === 0"
      class="mb-2 text-sm text-accent-muted"
    >
      {{ ui("noResults", lang) }}
    </p>
    <AppSelect
      :model-value="addStatValue"
      :options="filteredAvailableStats"
      :placeholder="ui('selectPlaceholder', lang)"
      class="w-full"
      @update:model-value="(v) => emit('update:addStatValue', v)"
    />
  </div>
  <div
    v-if="Object.keys(selectedStats).length > 0"
    class="mt-5 flex min-h-[100px] flex-col overflow-auto"
  >
    <div
      v-for="(stat, id) in selectedStats"
      :key="id"
      class="mb-3 rounded-lg border border-surface-border/20 bg-black/20 p-3 last:mb-0"
    >
      <div class="flex items-start gap-2">
        <button
          type="button"
          class="shrink-0 rounded-md border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-sm leading-none text-red-300 transition-colors hover:bg-red-500/25"
          @click="emit('removeStat', stat.id)"
        >
          −
        </button>
        <span class="min-w-0 flex-1 text-sm leading-snug">
          {{
            statLabelByStringId(
              getStat(stat.id).ID,
              translateStat(stat.id),
              lang,
            )
          }}
        </span>
      </div>
      <div
        class="mt-2.5 flex flex-wrap gap-3 text-sm text-muted justify-between"
      >
        <label class="flex items-center gap-2">
          <span>{{ ui("min", lang) }}:</span>
          <input
            :value="stat.min"
            type="number"
            min="0"
            :class="numInput"
            @input="
              updateStatMin(id, ($event.target as HTMLInputElement).value)
            "
          />
        </label>
        <label class="flex items-center gap-2">
          <span>{{ ui("weight", lang) }}:</span>
          <input
            :value="stat.weight"
            type="number"
            min="0"
            :class="numInput"
            @input="
              updateStatWeight(id, ($event.target as HTMLInputElement).value)
            "
          />
        </label>
      </div>
    </div>
    <div class="mt-3 flex items-center gap-2 text-sm">
      <span class="text-muted whitespace-nowrap"
        >{{ ui("minTotalWeight", lang) }}:</span
      >
      <input
        :value="minTotalWeight"
        type="number"
        min="0"
        :class="numInput"
        @input="
          emit(
            'update:minTotalWeight',
            parseFloat(($event.target as HTMLInputElement).value) || 0,
          )
        "
      />
    </div>
    <div class="mt-4 flex flex-col gap-2">
      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          :class="[
            chipBtn,
            isAllSelected
              ? 'border-accent/40 bg-accent/15 text-accent-muted'
              : 'border-surface-border/25 bg-white/5 text-muted hover:bg-white/10',
          ]"
          :disabled="searching"
          @click="emit('selectAll')"
        >
          {{ ui("selectAll", lang) }}
        </button>
        <button
          type="button"
          :class="[
            chipBtn,
            isAllNotablesSelected
              ? 'border-accent/40 bg-accent/15 text-accent-muted'
              : 'border-surface-border/25 bg-white/5 text-muted hover:bg-white/10',
          ]"
          :disabled="searching"
          @click="emit('selectAllNotables')"
        >
          {{ ui("notables", lang) }}
        </button>
        <button
          type="button"
          :class="[
            chipBtn,
            isAllPassivesSelected
              ? 'border-accent/40 bg-accent/15 text-accent-muted'
              : 'border-surface-border/25 bg-white/5 text-muted hover:bg-white/10',
          ]"
          :disabled="searching"
          @click="emit('selectAllPassives')"
        >
          {{ ui("passives", lang) }}
        </button>
        <button
          type="button"
          :class="[
            chipBtn,
            'flex-grow border-surface-border/25 bg-white/5 text-muted hover:bg-white/10',
          ]"
          :disabled="searching || disabled.length >= affectedNodesLength"
          @click="emit('deselectAll')"
        >
          {{ ui("deselect", lang) }}
        </button>
      </div>
      <button
        type="button"
        class="inline-flex min-w-[10rem] flex-grow cursor-pointer items-center justify-center gap-2 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-3 py-2.5 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="searching"
        @click="emit('search')"
      >
        <span
          v-if="searching"
          class="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
        <span class="min-w-0">{{ ui("search", lang) }}</span>
      </button>
    </div>
  </div>
</template>
