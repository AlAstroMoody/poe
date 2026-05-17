import { ref, toValue, type MaybeRefOrGetter } from "vue";
import { getData } from "@/services/wasmDataService";
import {
  getAffectedNodes,
  runReverseSearch,
  skillTree,
  type StatConfig,
  type SearchResults,
} from "@/lib/skill_tree";

export function useReverseSearch(options: {
  circledNode: MaybeRefOrGetter<number | undefined>;
  selectedJewel: MaybeRefOrGetter<number>;
  selectedConqueror: MaybeRefOrGetter<string>;
  disabled: MaybeRefOrGetter<number[]>;
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

    const node = skillTree.nodes[circledNode];
    if (!node) {
      searching.value = false;
      return;
    }

    const affectedNodes = getAffectedNodes(node).filter(
      (n) => !n.isJewelSocket && !n.isMastery,
    );

    const disabled = toValue(options.disabled);
    const selectedJewel = toValue(options.selectedJewel);
    const selectedConqueror = toValue(options.selectedConqueror);

    const config = {
      jewel: selectedJewel,
      conqueror: selectedConqueror,
      nodes: affectedNodes
        .filter((n) => !disabled.includes(n.skill!))
        .map((n) => data.TreeToPassive[n.skill!]?.Index)
        .filter((x): x is number => x != null),
      stats: Object.values(selectedStats),
      minTotalWeight: minTotalWeight.value,
    };
    try {
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
