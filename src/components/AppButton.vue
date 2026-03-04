<script setup lang="ts">
import { RouterLink } from "vue-router";

defineProps<{
  to: string | { name: string };
}>();
</script>

<template>
  <RouterLink
    :to="to"
    class="font-celtes text-heading inline-block rounded border border-heading/40 bg-black/25 py-3 px-6 tracking-[0.08em] no-underline transition-all duration-200 hover:bg-heading hover:text-black hover:border-heading/65"
  >
    <slot />
  </RouterLink>
</template>
