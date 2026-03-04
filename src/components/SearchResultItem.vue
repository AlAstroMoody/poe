<script setup lang="ts">
import type { SearchWithSeed } from "@/lib/skill_tree";
import { skillTree, translateStat, openTrade } from "@/lib/skill_tree";

defineProps<{
  set: SearchWithSeed;
  jewel: number;
  conqueror: string;
  platform: string;
  league: string;
}>();

const emit = defineEmits<{ highlight: [seed: number, passives: number[]] }>();
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="my-2 flex cursor-pointer flex-col border border-white/50 p-2 hover:bg-white/5"
    @click="
      emit(
        'highlight',
        set.seed,
        set.skills.map((s) => s.passive),
      )
    "
    @keydown.enter="
      emit(
        'highlight',
        set.seed,
        set.skills.map((s) => s.passive),
      )
    "
  >
    <div class="flex flex-row items-center justify-between">
      <span class="invisible px-3">Trade</span>
      <span class="text-center font-bold text-orange-500"
        >Seed {{ set.seed }} (weight {{ set.weight }})</span
      >
      <button
        type="button"
        class="cursor-pointer rounded border-none bg-blue-500/40 px-3 py-1 text-inherit hover:bg-blue-500/60"
        @click.stop="openTrade(jewel, conqueror, [set], platform, league)"
      >
        Trade
      </button>
    </div>
    <div v-for="skill in set.skills" :key="skill.passive" class="mt-2">
      <span
        >{{ skillTree.nodes[skill.passive]?.name ?? skill.passive }} ({{
          skill.passive
        }})</span
      >
      <ul class="list-inside list-disc pl-6 font-sans font-bold">
        <li v-for="(roll, statId) in skill.stats" :key="statId">
          {{ translateStat(Number(statId), roll) }}
        </li>
      </ul>
    </div>
  </div>
</template>
