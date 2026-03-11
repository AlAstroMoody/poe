<script setup lang="ts">
import { useCustomFont } from "@/composables/useCustomFont";

useCustomFont();
</script>

<template>
  <div class="w-full min-h-screen m-0 p-0">
    <RouterView />
  </div>
</template>
