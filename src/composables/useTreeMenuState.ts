import { ref, computed, watch, toValue, type MaybeRefOrGetter } from "vue";
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
import {
  isAbyssEyeJewel,
  isAbyssSpecialJewel,
  preloadAbyssSocket,
  preloadZorathTable,
} from "@/lib/abyssAffectedNodes";
import { ZORATH_EMPTY_ASCENDANCIES } from "@/lib/zorathPath";

export type JewelFamily = "timeless" | "abyss";

const CLASS_LABEL_RU: Record<string, string> = {
  Scion: "Дворянка",
  Marauder: "Дикарь",
  Ranger: "Охотница",
  Witch: "Ведьма",
  Duelist: "Дуэлянт",
  Templar: "Жрец",
  Shadow: "Бандит",
};

/** id восхождения → имя с оф. RU дерева (passive_skill_tree_ru.json classes[].ascendancies). */
const ASCENDANCY_LABEL_RU: Record<string, string> = {
  Ascendant: "Вознесшаяся",
  Reliquarian: "Реликварианка",
  Luminary: "Светоч",
  Juggernaut: "Покоритель",
  Berserker: "Берсерк",
  Chieftain: "Вождь",
  Raider: "Хранитель",
  Deadeye: "Снайпер",
  Pathfinder: "Следопыт",
  Occultist: "Оккультист",
  Elementalist: "Маг стихий",
  Necromancer: "Некромант",
  Slayer: "Рубака",
  Gladiator: "Гладиатор",
  Champion: "Чемпион",
  Inquisitor: "Инквизитор",
  Hierophant: "Иерофант",
  Guardian: "Защитник",
  Assassin: "Убийца",
  Trickster: "Плут",
  Saboteur: "Диверсант",
};

export function jewelFamilyOf(jewelId: number): JewelFamily {
  return jewelId >= 7 ? "abyss" : "timeless";
}

export function useTreeMenuState(options: {
  lang: MaybeRefOrGetter<Lang>;
  circledNode: MaybeRefOrGetter<number | undefined>;
  selectedJewel: MaybeRefOrGetter<number>;
  selectedConqueror: MaybeRefOrGetter<string>;
  seed: MaybeRefOrGetter<number>;
  disabled: MaybeRefOrGetter<number[]>;
  classStartIndex?: MaybeRefOrGetter<number>;
  ascendancyName?: MaybeRefOrGetter<string>;
}) {
  const data = getData();

  watch(
    [() => toValue(options.circledNode), () => toValue(options.selectedJewel)],
    ([socketId, jewel]) => {
      if (socketId && isAbyssEyeJewel(jewel)) {
        void preloadAbyssSocket(socketId, jewel);
      }
      if (isAbyssSpecialJewel(jewel)) {
        void preloadZorathTable();
      }
    },
    { immediate: true },
  );

  const jewels = computed(() => {
    const lang = toValue(options.lang);
    return Object.keys(data.TimelessJewels).map((k) => {
      const id = Number(k);
      const enLabel = data.TimelessJewels[id];
      return { value: id, label: jewelLabel(id, enLabel, lang) };
    });
  });

  const jewelFamily = computed(() =>
    jewelFamilyOf(toValue(options.selectedJewel) || 1),
  );

  const familyJewels = computed(() => {
    const family = jewelFamily.value;
    return jewels.value.filter((j) => jewelFamilyOf(j.value) === family);
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

  /** Classic timeless: pick among several. Abyss: one lich — no dropdown. */
  const showConquerorSelect = computed(() => conquerors.value.length > 1);

  const isAbyssJewel = computed(() => {
    const id = toValue(options.selectedJewel);
    return isAbyssEyeJewel(id) || isAbyssSpecialJewel(id);
  });

  const isZorathJewel = computed(() =>
    isAbyssSpecialJewel(toValue(options.selectedJewel)),
  );

  const classOptions = computed(() => {
    const lang = toValue(options.lang);
    if (!skillTree?.classes) return [];
    return skillTree.classes.map((c, i) => ({
      value: i,
      label: lang === "ru" ? (CLASS_LABEL_RU[c.name] ?? c.name) : c.name,
    }));
  });

  const ascendancyOptions = computed(() => {
    const idx = toValue(options.classStartIndex ?? 0);
    const lang = toValue(options.lang);
    const cls = skillTree?.classes?.[idx];
    if (!cls) return [];
    return cls.ascendancies
      .filter((a) => !ZORATH_EMPTY_ASCENDANCIES.has(a.id))
      .map((a) => ({
        value: a.id,
        label:
          lang === "ru" ? (ASCENDANCY_LABEL_RU[a.id] ?? a.name) : a.name,
      }));
  });

  const affectedNodes = computed(() => {
    const circledNode = toValue(options.circledNode);
    if (!circledNode || !skillTree?.nodes[circledNode]) return [];
    return getAffectedNodes(skillTree.nodes[circledNode], {
      jewelType: toValue(options.selectedJewel),
      seed: toValue(options.seed),
      classStartIndex: toValue(options.classStartIndex ?? 0),
      ascendancyName: toValue(options.ascendancyName ?? ""),
    }).filter((n) => !n.isJewelSocket && !n.isMastery);
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
    familyJewels,
    jewelFamily,
    conquerors,
    showConquerorSelect,
    isAbyssJewel,
    isZorathJewel,
    classOptions,
    ascendancyOptions,
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
