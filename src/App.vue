<script setup lang="ts">
import { useCustomFont } from "@/composables/useCustomFont";

useCustomFont();
</script>

<template>
  <div class="app-shell w-full m-0 p-0">
    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  overflow-x: clip;
}
</style>
