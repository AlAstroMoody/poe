<script setup lang="ts">
defineProps<{
  open: boolean;
  label: string;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

<template>
  <button
    type="button"
    class="menu-toggle inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-surface-border/25 bg-white/5 text-heading transition-colors hover:bg-white/10"
    :aria-label="label"
    :aria-expanded="open"
    :title="label"
    @click="emit('click')"
  >
    <svg
      class="size-[1.125rem]"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <template v-if="open">
        <path d="M3.5 3.5 L12.5 12.5" />
        <path d="M12.5 3.5 L3.5 12.5" />
      </template>
      <template v-else>
        <path d="M2.5 4 H13.5" />
        <path d="M2.5 8 H13.5" />
        <path d="M2.5 12 H13.5" />
      </template>
    </svg>
  </button>
</template>
