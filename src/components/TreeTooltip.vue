<script setup lang="ts">
export type TooltipLine = {
  text: string;
  special?: boolean;
};

defineProps<{
  title: string;
  lines: TooltipLine[];
  style?: Record<string, string>;
}>();
</script>

<template>
  <div
    role="tooltip"
    :style="style"
    class="pointer-events-none absolute z-20 w-max min-w-[11rem] max-w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-surface-border/30 bg-surface/95 shadow-surface backdrop-blur-md"
  >
    <div
      class="border-b border-surface-border/30 bg-surface-header/50 px-3 py-2 text-sm font-semibold leading-snug text-heading md:px-4 md:py-2.5 md:text-lg"
    >
      {{ title }}
    </div>
    <div
      v-if="lines.length"
      class="space-y-1 px-3 py-2.5 text-sm leading-relaxed text-white md:space-y-1.5 md:px-4 md:py-3 md:text-base md:leading-relaxed"
    >
      <p
        v-for="(line, i) in lines"
        :key="i"
        class="break-words"
        :class="line.special ? 'text-accent-muted' : ''"
      >
        {{ line.text }}
      </p>
    </div>
  </div>
</template>
