<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";

const model = defineModel<string | number>({ default: "" });

const props = withDefaults(
  defineProps<{
    options: { value: string | number; label: string }[];
    placeholder?: string;
    class?: string;
    dropdownMinWidth?: number;
  }>(),
  { placeholder: "", class: "", dropdownMinWidth: 220 },
);

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);

const dropdownStyle = ref<{ top: string; left: string; width: string }>({
  top: "0",
  left: "0",
  width: "0",
});

const currentLabel = computed(() => {
  if (model.value === undefined || model.value === null || model.value === "")
    return props.placeholder;
  const opt = props.options.find((o) => o.value === model.value);
  return opt?.label ?? String(model.value);
});

function updateDropdownPosition() {
  if (!trigger.value) return;
  const r = trigger.value.getBoundingClientRect();
  const width = Math.max(r.width, props.dropdownMinWidth);
  dropdownStyle.value = {
    top: `${r.bottom + 4}px`,
    left: `${r.left}px`,
    width: `${width}px`,
  };
}

watch(open, (isOpen) => {
  if (isOpen) updateDropdownPosition();
});

function select(value: string | number) {
  const num = Number(value);
  model.value = Number.isNaN(num) ? value : num;
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div ref="root" class="relative w-full">
    <button
      ref="trigger"
      type="button"
      class="w-full cursor-pointer rounded-md border border-surface-border/25 bg-input-bg px-3 py-2.5 text-left text-sm text-inherit outline-none transition-[border-color,box-shadow] hover:border-surface-border/40 focus:border-accent/40 focus:ring-1 focus:ring-accent/25"
      :class="props.class"
      aria-haspopup="listbox"
      :aria-expanded="open"
      aria-label="Выбор"
      @click="open = !open"
    >
      {{ currentLabel }}
    </button>
    <Teleport to="body">
      <div
        v-show="open"
        class="fixed z-[9999] max-h-64 overflow-y-auto rounded-md border border-surface-border/30 bg-surface py-1 shadow-surface backdrop-blur-md"
        role="listbox"
        :style="dropdownStyle"
      >
        <button
          v-if="
            placeholder &&
            (model === '' || model === undefined || model === null)
          "
          type="button"
          role="option"
          class="w-full cursor-pointer px-3 py-2 text-left text-inherit hover:bg-white/10 bg-heading/20"
          @click="select('')"
        >
          {{ placeholder }}
        </button>
        <button
          v-for="opt in options"
          :key="String(opt.value)"
          type="button"
          role="option"
          class="w-full cursor-pointer px-3 py-2 text-left font-sans text-inherit hover:bg-white/10"
          :class="{ 'bg-heading/20': model === opt.value }"
          @click="select(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
