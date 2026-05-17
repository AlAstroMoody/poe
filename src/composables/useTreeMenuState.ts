import { ref, computed, toValue, type MaybeRefOrGetter } from "vue";
import { getData } from "@/services/wasmDataService";
import {
  getAffectedNodes,
  skillTree,
  translateStat,
  getStat,
  type StatConfig,
} from "@/lib/skill_tree";
import { jewelLabel, conquerorLabel, statLabelByStringId } from "@/lib/dict";
import type { Lang } from "@/lib/i18n";

export function useTreeMenuState(options: {
  lang: MaybeRefOrGetter<Lang>;
  circledNode: MaybeRefOrGetter<number | undefined>;
  selectedJewel: MaybeRefOrGetter<number>;
  selectedConqueror: MaybeRefOrGetter<string>;
  seed: MaybeRefOrGetter<number>;
  disabled: MaybeRefOrGetter<number[]>;
}) {
  const data = getData();

  const jewels = computed(() => {
    const lang = toValue(options.lang);
    return Object.keys(data.TimelessJewels).map((k) => {
      const id = Number(k);
      const enLabel = data.TimelessJewels[id];
      return { value: id, label: jewelLabel(id, enLabel, lang) };
    });
  });

  const conquerors = computed(() => {
    const selectedJewel = toValue(options.selectedJewel);
    const lang = toValue(options.lang);
    if (!selectedJewel) return [];
    const conq = data.TimelessJewelConquerors[selectedJewel];
    if (!conq) return [];
    return Object.keys(conq).map((k) => ({
      value: k,
      label: conquerorLabel(k, lang),
    }));
  });

  const affectedNodes = computed(() => {
    const circledNode = toValue(options.circledNode);
    if (!circledNode || !skillTree?.nodes[circledNode]) return [];
    return getAffectedNodes(skillTree.nodes[circledNode]).filter(
      (n) => !n.isJewelSocket && !n.isMastery,
    );
  });

  const seedRanges = computed(() => {
    const selectedJewel = toValue(options.selectedJewel);
    return data.TimelessJewelSeedRanges[selectedJewel];
  });

  const seedValid = computed(() => {
    const r = seedRanges.value;
    const seed = toValue(options.seed);
    if (!r) return false;
    return seed >= r.Min && seed <= r.Max;
  });

  const mode = ref<"seed" | "stats">("seed");
  const selectedStats = ref<Record<number, StatConfig>>({});
  const allPossibleStats = computed(() => {
    const selectedJewel = toValue(options.selectedJewel);
    return selectedJewel
      ? (JSON.parse(data.PossibleStats) as Record<
          number,
          Record<string, number>
        >)
      : {};
  });
  const availableStats = computed(() => {
    const selectedJewel = toValue(options.selectedJewel);
    const lang = toValue(options.lang);
    if (!selectedJewel) return [];
    const keys = Object.keys(allPossibleStats.value[selectedJewel] ?? {});
    return keys
      .map((statId) => {
        const id = Number(statId);
        const enLabel = translateStat(id);
        const stringId = getStat(id).ID;
        return {
          label: statLabelByStringId(stringId, enLabel, lang),
          value: id,
        };
      })
      .filter((s) => !(s.value in selectedStats.value));
  });
  const statListFilter = ref("");
  const filteredAvailableStats = computed(() => {
    const q = statListFilter.value.trim().toLowerCase();
    const list = availableStats.value;
    if (!q) return list;
    return list.filter((s) => s.label.toLowerCase().includes(q));
  });

  const collapsed = ref(false);

  const seedTouched = ref(false);

  const notableIds = computed(() =>
    affectedNodes.value.filter((n) => n.isNotable).map((n) => n.skill!),
  );
  const passiveIds = computed(() =>
    affectedNodes.value.filter((n) => !n.isNotable).map((n) => n.skill!),
  );

  const disabled = computed(() => toValue(options.disabled));

  const isAllSelected = computed(() => disabled.value.length === 0);
  const isAllNotablesSelected = computed(
    () =>
      notableIds.value.length > 0 &&
      notableIds.value.every((id) => !disabled.value.includes(id)),
  );
  const isAllPassivesSelected = computed(
    () =>
      passiveIds.value.length > 0 &&
      passiveIds.value.every((id) => !disabled.value.includes(id)),
  );

  const allAffectedSkillIds = computed(() =>
    affectedNodes.value
      .filter((n) => !n.isJewelSocket && !n.isMastery)
      .map((n) => n.skill!),
  );

  return {
    jewels,
    conquerors,
    affectedNodes,
    seedRanges,
    seedValid,
    mode,
    selectedStats,
    allPossibleStats,
    availableStats,
    statListFilter,
    filteredAvailableStats,
    collapsed,
    seedTouched,
    notableIds,
    passiveIds,
    isAllSelected,
    isAllNotablesSelected,
    isAllPassivesSelected,
    allAffectedSkillIds,
  };
}
