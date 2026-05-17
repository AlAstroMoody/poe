<script setup lang="ts">
import type { Lang } from "@/lib/i18n";
import type { SearchWithSeed } from "@/lib/skill_tree";
import { openTrade, translateStat, translateTreeSkillName } from "@/lib/skill_tree";

const props = defineProps<{
  set: SearchWithSeed;
  lang: Lang;
  jewel: number;
  conqueror: string;
  platform: string;
  league: string;
}>();

const emit = defineEmits<{ highlight: [seed: number, passives: number[]] }>();

function onHighlight() {
  emit(
    "highlight",
    props.set.seed,
    props.set.skills.map((s) => s.passive),
  );
}
</script>

<template>
  <article
    role="button"
    tabindex="0"
    class="group cursor-pointer rounded-lg border border-surface-border/25 bg-black/20 shadow-sm ring-1 ring-transparent transition-[border-color,background-color,box-shadow,ring-color] duration-150 hover:border-accent/45 hover:bg-accent/10 hover:ring-accent-muted/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60"
    @click="onHighlight"
    @keydown.enter="onHighlight"
  >
    <div class="flex items-stretch gap-2 p-2.5">
      <div class="min-w-0 flex-1">
        <span class="text-xs font-medium uppercase tracking-wide text-muted"
          >Seed</span
        >
        <span class="ml-2 text-base font-semibold tabular-nums text-accent-muted">{{
          set.seed
        }}</span>
        <span class="ml-2 text-xs text-muted">· weight {{ set.weight }}</span>
      </div>
      <button
        type="button"
        class="shrink-0 self-start rounded-md border border-surface-border/25 bg-white/5 px-2.5 py-1.5 text-xs text-inherit transition-colors group-hover:border-surface-border/40 group-hover:bg-white/10 hover:bg-white/15"
        @click.stop="openTrade(jewel, conqueror, [set], platform, league)"
      >
        Trade
      </button>
    </div>

    <div
      class="space-y-2 border-t border-surface-border/15 px-2.5 pb-2.5 pt-2 transition-colors group-hover:border-accent/25"
    >
      <section
        v-for="skill in set.skills"
        :key="skill.passive"
        class="rounded-md px-2 py-2 transition-colors group-hover:bg-black/20"
      >
        <p class="text-sm font-medium leading-snug text-heading">
          {{ translateTreeSkillName(skill.passive, lang) }}
          <span class="font-normal text-muted">({{ skill.passive }})</span>
        </p>
        <ul class="mt-1.5 space-y-0.5 border-l-2 border-accent/35 pl-2.5 text-sm leading-relaxed text-white/90">
          <li v-for="(roll, statId) in skill.stats" :key="statId">
            {{ translateStat(Number(statId), roll, lang) }}
          </li>
        </ul>
      </section>
    </div>
  </article>
</template>
