<script setup lang="ts">
const model = defineModel<string | number>({ required: true });

const props = defineProps<{
  type?: string;
  min?: number;
  max?: number;
  class?: string;
}>();

function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  if (props.type === "number") {
    const n = Number(el.value);
    let val = Number.isNaN(n) ? 0 : n;
    // При вводе ограничиваем только сверху, чтобы можно было набирать "1" → "12" → "12000"
    if (props.max != null && val > props.max) {
      val = Math.round(props.max);
      el.value = String(val);
    }
    model.value = val;
  } else {
    model.value = el.value;
  }
}
</script>

<template>
  <input
    :value="model"
    :type="type ?? 'text'"
    :min="min"
    :max="max"
    class="w-full rounded-md border border-surface-border/25 bg-input-bg px-3 py-2.5 text-sm text-inherit outline-none transition-[border-color,box-shadow] focus:border-accent/40 focus:ring-1 focus:ring-accent/25"
    :class="props.class"
    @input="onInput"
    v-bind="$attrs"
  />
</template>
