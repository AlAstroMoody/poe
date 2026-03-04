<script setup lang="ts">
defineProps({ popupText: String });
</script>

<template>
  <span class="group relative inline">
    <span class="cursor-default border-b border-dotted border-heading/50">
      <slot />
    </span>
    <span
      role="tooltip"
      class="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded border border-heading/35 bg-black/90 px-2 py-1 text-sm text-heading opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 z-[100]"
    >
      {{ popupText }}
    </span>
  </span>
</template>
