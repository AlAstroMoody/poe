import { ref, computed, toValue, type MaybeRefOrGetter } from "vue";
import { getData } from "@/services/wasmDataService";
import {
  getAffectedNodes,
  combineResults,
  sortCombined,
  skillTree,
  type SortOrder,
} from "@/lib/skill_tree";
import { calculateTimelessForTreeSkill } from "@/lib/timelessJewelCalculate";
import { getJewelFlavorLines } from "@/lib/dict";
import type { Lang } from "@/lib/i18n";

export function useSeedPreview(options: {
  lang: MaybeRefOrGetter<Lang>;
  circledNode: MaybeRefOrGetter<number | undefined>;
  selectedJewel: MaybeRefOrGetter<number>;
  selectedConqueror: MaybeRefOrGetter<string>;
  seed: MaybeRefOrGetter<number>;
  highlighted: MaybeRefOrGetter<number[]>;
}) {
  const sortOrder = ref<SortOrder>("count");
  const data = getData();

  const seedResults = computed(() => {
    const seed = toValue(options.seed);
    const selectedJewel = toValue(options.selectedJewel);
    const selectedConqueror = toValue(options.selectedConqueror);
    const circledNode = toValue(options.circledNode);

    if (!seed || !selectedJewel || !selectedConqueror || !circledNode)
      return [];

    const node = skillTree.nodes[circledNode];
    if (!node) return [];

    const affectedNodes = getAffectedNodes(node).filter(
      (n) => !n.isJewelSocket && !n.isMastery,
    );

    return affectedNodes
      .filter((n) => n.skill != null && data.TreeToPassive[n.skill])
      .map((n) => ({
        node: n.skill!,
        result: calculateTimelessForTreeSkill(
          n.skill!,
          seed,
          selectedJewel,
          selectedConqueror,
        ),
      }))
      .filter(
        (x): x is { node: number; result: NonNullable<typeof x.result> } =>
          x.result != null,
      );
  });

  const jewelFlavorLines = computed(() => {
    const selectedJewel = toValue(options.selectedJewel);
    const selectedConqueror = toValue(options.selectedConqueror);
    const lang = toValue(options.lang);

    const range = data.TimelessJewelSeedRanges[selectedJewel];
    if (!range) return [];

    return getJewelFlavorLines(
      selectedJewel,
      range.Min,
      range.Max,
      selectedConqueror,
      lang,
    );
  });

  const combinedAll = computed(() => {
    const seed = toValue(options.seed);
    const selectedJewel = toValue(options.selectedJewel);
    const range = data.TimelessJewelSeedRanges[selectedJewel];

    if (seed >= (range?.Min ?? 0) && seed <= (range?.Max ?? 0)) {
      return sortCombined(
        combineResults(seedResults.value, "all", selectedJewel),
        sortOrder.value,
        selectedJewel,
      );
    }
    return [];
  });

  const combinedNotables = computed(() => {
    const seed = toValue(options.seed);
    const selectedJewel = toValue(options.selectedJewel);
    const range = data.TimelessJewelSeedRanges[selectedJewel];

    if (seed >= (range?.Min ?? 0) && seed <= (range?.Max ?? 0)) {
      return sortCombined(
        combineResults(seedResults.value, "notables", selectedJewel),
        sortOrder.value,
        selectedJewel,
      );
    }
    return [];
  });

  const combinedPassives = computed(() => {
    const seed = toValue(options.seed);
    const selectedJewel = toValue(options.selectedJewel);
    const range = data.TimelessJewelSeedRanges[selectedJewel];

    if (seed >= (range?.Min ?? 0) && seed <= (range?.Max ?? 0)) {
      return sortCombined(
        combineResults(seedResults.value, "passives", selectedJewel),
        sortOrder.value,
        selectedJewel,
      );
    }
    return [];
  });

  function isHighlightedItem(passives: number[]) {
    const highlighted = toValue(options.highlighted);
    if (highlighted.length !== passives.length) return false;
    const a = [...highlighted].sort((x, y) => x - y);
    const b = [...passives].sort((x, y) => x - y);
    return a.every((v, i) => v === b[i]);
  }

  return {
    sortOrder,
    jewelFlavorLines,
    combinedAll,
    combinedNotables,
    combinedPassives,
    isHighlightedItem,
  };
}
