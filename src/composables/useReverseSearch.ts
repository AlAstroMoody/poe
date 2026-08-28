import { nextTick, ref, toValue, type MaybeRefOrGetter } from "vue";
import { getData } from "@/services/wasmDataService";
import {
  getAffectedNodes,
  processReverseSearchRaw,
  runReverseSearch,
  skillTree,
  type StatConfig,
  type SearchResults,
} from "@/lib/skill_tree";
import {
  isAbyssEyeJewel,
  isAbyssSpecialJewel,
  preloadAbyssSocket,
  preloadZorathTable,
  reverseSearchAbyssEyeLut,
  reverseSearchZorathLut,
} from "@/lib/abyssAffectedNodes";

/** Дать Vue отрисовать прелоадер до тяжёлой работы. */
async function allowPreloaderPaint() {
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function useReverseSearch(options: {
  circledNode: MaybeRefOrGetter<number | undefined>;
  selectedJewel: MaybeRefOrGetter<number>;
  selectedConqueror: MaybeRefOrGetter<string>;
  disabled: MaybeRefOrGetter<number[]>;
  classStartIndex?: MaybeRefOrGetter<number>;
  ascendancyName?: MaybeRefOrGetter<string>;
}) {
  const data = getData();

  const minTotalWeight = ref(0);
  const searching = ref(false);
  const searchResults = ref<SearchResults | null>(null);
  const showResults = ref(false);
  const groupResults = ref(true);
  const expandedGroup = ref<number | "">("");

  async function search(selectedStats: Record<number, StatConfig>) {
    const circledNode = toValue(options.circledNode);
    if (!circledNode) return;

    searching.value = true;
    searchResults.value = null;
    await allowPreloaderPaint();

    const node = skillTree.nodes[circledNode];
    if (!node) {
      searching.value = false;
      return;
    }

    const disabled = toValue(options.disabled);
    const selectedJewel = toValue(options.selectedJewel);
    const selectedConqueror = toValue(options.selectedConqueror);
    const stats = Object.values(selectedStats);
    const minW = minTotalWeight.value;
    const disabledSet = new Set(disabled);
    const treeToPassiveIndex = (treeSkillId: number) =>
      data.TreeToPassive[treeSkillId]?.Index;

    try {
      if (isAbyssEyeJewel(selectedJewel) && node.skill != null) {
        await preloadAbyssSocket(node.skill, selectedJewel);
        const raw = await reverseSearchAbyssEyeLut(
          node.skill,
          selectedJewel,
          stats.map((s) => s.id),
          disabledSet,
          treeToPassiveIndex,
        );
        searchResults.value = processReverseSearchRaw(raw, {
          stats,
          minTotalWeight: minW,
        });
        showResults.value = true;
        return;
      }

      if (isAbyssSpecialJewel(selectedJewel) && node.skill != null) {
        await preloadZorathTable();
        const raw = await reverseSearchZorathLut(
          skillTree.nodes,
          node.skill,
          toValue(options.classStartIndex ?? 0),
          toValue(options.ascendancyName ?? "") || undefined,
          stats.map((s) => s.id),
          disabledSet,
          treeToPassiveIndex,
        );
        searchResults.value = processReverseSearchRaw(raw, {
          stats,
          minTotalWeight: minW,
        });
        showResults.value = true;
        return;
      }

      const affectedNodes = getAffectedNodes(node, {
        jewelType: selectedJewel,
        classStartIndex: toValue(options.classStartIndex ?? 0),
        ascendancyName: toValue(options.ascendancyName ?? ""),
      }).filter((n) => !n.isJewelSocket && !n.isMastery);

      const config = {
        jewel: selectedJewel,
        conqueror: selectedConqueror,
        nodes: affectedNodes
          .filter((n) => !disabled.includes(n.skill!))
          .map((n) => data.TreeToPassive[n.skill!]?.Index)
          .filter((x): x is number => x != null),
        stats,
        minTotalWeight: minW,
      };
      searchResults.value = await runReverseSearch(config, () => {});
      showResults.value = true;
    } finally {
      searching.value = false;
    }
  }

  return {
    minTotalWeight,
    searching,
    searchResults,
    showResults,
    groupResults,
    expandedGroup,
    search,
  };
}
