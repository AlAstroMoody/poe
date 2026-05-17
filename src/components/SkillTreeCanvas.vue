<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from "vue";
import type { Node } from "@/lib/skill_tree_types";
import type { Point } from "@/lib/skill_tree";
import {
  baseJewelRadius,
  calculateNodePos,
  distance,
  drawnGroups,
  drawnNodes,
  formatStats,
  inverseSprites,
  inverseSpritesActive,
  inverseTranslations,
  orbitAngleAt,
  skillTree,
  toCanvasCoords,
  translateStat,
  translatePassiveSkillName,
  displayRollForStatTemplate,
} from "@/lib/skill_tree";
import { getData } from "@/services/wasmDataService";
import { getLanguage } from "@/lib/i18n";
import {
  statNamesRuByStringId,
  statTemplatesEnByStringId,
  formatStatTemplate,
  keystoneLabel,
  passiveNamesRuById,
  passiveSkillGraphIdToNameRu,
  passiveNodeRu,
  translateStatByDisplayString,
  getStatIdFromDisplayLines,
  getStatTextById,
  formatRuStatLineFromWasm,
  extractRollsFromDisplayString,
  statIdByRuName,
  ui,
} from "@/lib/dict";
import { BASE_DATA_URL } from "@/config";
import { isTreeDebugEnabled, treeDebugLog } from "@/lib/treeDebug";
import {
  alternateLookupTraceForTreeSkill,
  calculateTimelessForTreeSkill,
  getPassiveRowByTreeSkill,
  isPassiveSkillStub,
} from "@/lib/timelessJewelCalculate";
import pobAlternateLinesEnById from "@/lib/alternatePassiveDisplayEnById.json";
import TreeTooltip, { type TooltipLine } from "./TreeTooltip.vue";
import {
  tooltipPlacementStyle,
  clampTooltipAnchorX,
} from "@/lib/tooltipPlacement";

/** Строки тултипа EN из PoB LegionPassives (sd), когда stat_descriptions нет */
const pobAltDisplayEn = pobAlternateLinesEnById as Record<string, string[]>;

const props = withDefaults(
  defineProps<{
    circledNode?: number;
    selectedJewel?: number;
    selectedConqueror?: string;
    seed?: number;
    highlighted?: number[];
    disabled?: number[];
    highlightJewels?: boolean;
    /** Текущий язык (если передан — тултип пересчитывается при смене без перезагрузки). */
    lang?: "ru" | "en";
  }>(),
  { highlighted: () => [], disabled: () => [], highlightJewels: false },
);

const emit = defineEmits<{ clickNode: [node: Node] }>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const scaling = ref(10);
const offsetX = ref(0);
const offsetY = ref(0);
const mousePos = ref<Point>({ x: Number.MIN_VALUE, y: Number.MIN_VALUE });
const hoveredNode = ref<Node | undefined>();
const cursor = ref("unset");
const width = ref(window.innerWidth);
const height = ref(window.innerHeight);
const initialized = ref(false);
const down = ref(false);
const downX = ref(0);
const downY = ref(0);
const startX = ref(0);
const startY = ref(0);
const slowTime = ref(0);
let rafId = 0;
let animFrame = 0;

/** Кеш содержимого тултипа: пересчёт только при смене ноды/языка/камня. */
type TooltipCache = {
  nodeName: string;
  lines: TooltipLine[];
};
let tooltipCache: { key: string; data: TooltipCache } | null = null;
const tooltipContent = ref<TooltipCache | null>(null);
const tooltipStyle = ref<Record<string, string> | null>(null);
let lastTooltipLang: "ru" | "en" | null = null;
let lastAltLogKey: string | null = null;

/** Когда нет шаблона/перевода — показываем id в читаемом виде вместо сырого "cold_damage_+%". */
function statIdToDisplayFallback(statId: string): string {
  return statId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normStatTooltipLine(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Текст совпадает с slug из Stats.dat / Id — реального описания из клиента нет. */
function tooltipTextLooksLikeUnresolvedStatSlug(
  text: string,
  statIdStr: string,
  statRowText: string,
): boolean {
  const slugNorm = (s: string) => normStatTooltipLine(s.replace(/_/g, " "));
  const t = slugNorm(text);
  if (t === slugNorm(statIdStr)) return true;
  if (statRowText && t === slugNorm(statRowText)) return true;
  if (t === normStatTooltipLine(statIdToDisplayFallback(statIdStr)))
    return true;
  return false;
}

/** Для альтернативной ноды: строки тултипа как в экспорте дерева (официальный текст ноды). */
function graphAlternateStatLinesFromSkillTree(
  skill: number | undefined,
  node: Node | undefined,
  lang: "ru" | "en",
  statIndex: number,
  statsKeysLen: number,
): string | null {
  if (skill == null || statsKeysLen <= 0) return null;
  if (lang === "ru") {
    const ru = passiveNodeRu[String(skill)];
    if (ru?.stats?.length) {
      if (statsKeysLen === 1) return ru.stats.join("\n");
      if (statIndex < ru.stats.length) return ru.stats[statIndex];
    }
  }
  const stats = node?.stats;
  if (!stats?.length) return null;
  if (statsKeysLen === 1) return stats[0];
  if (statIndex < stats.length) return stats[statIndex];
  return null;
}

/** WASM: GetStatByIndex может вернуть null, если нет строки в data/stats.json.gz для этого _key. */
const warnedMissingStatIds = new Set<number>();

function wasmStatRow(
  statId: number,
  context: string,
): { ID: string; Text: string } {
  const row = getData().GetStatByIndex(statId) as
    | {
        ID?: string;
        Text?: string;
      }
    | null
    | undefined;
  if (row != null) {
    return {
      ID: row.ID || String(statId),
      Text: row.Text ?? "",
    };
  }
  if (import.meta.env.DEV && !warnedMissingStatIds.has(statId)) {
    warnedMissingStatIds.add(statId);
    console.warn(
      `[SkillTreeCanvas] нет Stats._key=${statId} в встроенном stats.json.gz (${context}). Добавьте строку из экспорта Stats.dat или обновите stats.`,
    );
  }
  return { ID: String(statId), Text: "" };
}

/**
 * Go/WASM отдаёт роллы как uint32; отрицательные значения (напр. −25 для self_damaging_ailment_duration_+%)
 * приходят как 4294967271 — без приведения шаблон показывает мусор.
 */
function coerceSignedStatRoll(raw: number): number {
  if (!Number.isFinite(raw)) return raw;
  if (raw >= 2147483648 && raw <= 4294967295) return raw - 4294967296;
  return raw;
}

/** Роллы из WASM: map uint32→uint32 может прийти с числовыми или строковыми ключами. */
function wasmStatRoll(
  rolls: Record<number, number> | undefined,
  i: number,
): number | undefined {
  if (!rolls) return undefined;
  const a = rolls[i];
  const pick = a !== undefined ? a : rolls[i as unknown as keyof typeof rolls];
  if (typeof pick !== "number") return undefined;
  return coerceSignedStatRoll(pick);
}

const jewelRadius = computed(() => baseJewelRadius / scaling.value);
const startGroups = [427, 320, 226, 227, 323, 422, 329];
const drawScaling = 2.6;

const spriteCache: Record<string, HTMLImageElement> = {};
const spriteCacheActive: Record<string, HTMLImageElement> = {};

function resolveSpriteUrl(filename: string): string {
  if (filename.startsWith("http")) return filename;
  const base = BASE_DATA_URL.replace(/\/$/, "");
  return filename.startsWith("/") ? base + filename : base + "/" + filename;
}

/** Без этого drawImage бросает InvalidStateError для ещё грузящихся или битых картинок. */
function isImageDrawable(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0;
}

function drawSprite(
  context: CanvasRenderingContext2D,
  path: string,
  pos: Point,
  active = false,
  mirrored = false,
) {
  let sprite = active ? inverseSpritesActive[path] : inverseSprites[path];
  if (!sprite && active) sprite = inverseSprites[path];
  if (!sprite) return;

  const spriteSheetUrl = resolveSpriteUrl(sprite.filename);
  const cache = active ? spriteCacheActive : spriteCache;
  if (!(spriteSheetUrl in cache)) {
    const img = new Image();
    img.decoding = "async";
    cache[spriteSheetUrl] = img;
    img.src = spriteSheetUrl;
  }
  const sheet = cache[spriteSheetUrl];
  if (!isImageDrawable(sheet)) return;

  const self = sprite.coords[path];
  if (!self) return;

  const newWidth = (self.w / scaling.value) * drawScaling;
  const newHeight = (self.h / scaling.value) * drawScaling;
  const topLeftX = pos.x - newWidth / 2;
  const topLeftY = pos.y - newHeight / 2;
  let finalY = mirrored ? topLeftY - newHeight / 2 : topLeftY;

  context.drawImage(
    sheet,
    self.x,
    self.y,
    self.w,
    self.h,
    topLeftX,
    finalY,
    newWidth,
    newHeight,
  );
  if (mirrored) {
    context.save();
    context.translate(topLeftX, topLeftY);
    context.rotate(Math.PI);
    context.drawImage(
      sheet,
      self.x,
      self.y,
      self.w,
      self.h,
      -newWidth,
      -newHeight / 2,
      newWidth,
      -newHeight,
    );
    context.restore();
  }
}

function pushTooltipLines(
  lines: TooltipLine[],
  text: string,
  special: boolean,
) {
  text
    .replace(/\\n/g, "\n")
    .split("\n")
    .forEach((line) => {
      const trimmed = line.trim();
      if (trimmed) lines.push({ text: trimmed, special });
    });
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas || !skillTree) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = width.value;
  const h = height.value;
  const start = performance.now();

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#080c11";
  ctx.fillRect(0, 0, w, h);

  const connected: Record<string, boolean> = {};
  Object.keys(drawnGroups).forEach((groupId) => {
    const group = drawnGroups[Number(groupId)];
    const groupPos = toCanvasCoords(
      group.x,
      group.y,
      offsetX.value,
      offsetY.value,
      scaling.value,
    );
    const maxOrbit = Math.max(...group.orbits);
    if (startGroups.indexOf(parseInt(groupId)) >= 0) return;
    if (maxOrbit === 1) drawSprite(ctx, "PSGroupBackground1", groupPos, false);
    else if (maxOrbit === 2)
      drawSprite(ctx, "PSGroupBackground2", groupPos, false);
    else if (maxOrbit === 3 || group.orbits.length > 1)
      drawSprite(ctx, "PSGroupBackground3", groupPos, false, true);
  });

  Object.keys(drawnNodes).forEach((nodeId) => {
    const node = drawnNodes[Number(nodeId)];
    const angle = orbitAngleAt(node.orbit!, node.orbitIndex!);
    const rotatedPos = calculateNodePos(
      node,
      offsetX.value,
      offsetY.value,
      scaling.value,
    );

    node.out?.forEach((o: string) => {
      if (!drawnNodes[Number(o)]) return;
      const min = Math.min(parseInt(o), parseInt(nodeId));
      const max = Math.max(parseInt(o), parseInt(nodeId));
      const joined = min + ":" + max;
      if (connected[joined]) return;
      connected[joined] = true;

      const targetNode = drawnNodes[Number(o)];
      if (!targetNode || targetNode.isMastery) return;

      const targetAngle = orbitAngleAt(
        targetNode.orbit!,
        targetNode.orbitIndex!,
      );
      const targetRotatedPos = calculateNodePos(
        targetNode,
        offsetX.value,
        offsetY.value,
        scaling.value,
      );

      ctx.beginPath();
      if (node.group !== targetNode.group || node.orbit !== targetNode.orbit) {
        ctx.moveTo(rotatedPos.x, rotatedPos.y);
        ctx.lineTo(targetRotatedPos.x, targetRotatedPos.y);
      } else {
        let a = Math.PI / 180 - (Math.PI / 180) * angle;
        let b = Math.PI / 180 - (Math.PI / 180) * targetAngle;
        a -= Math.PI / 2;
        b -= Math.PI / 2;
        const diff = Math.abs(Math.max(a, b) - Math.min(a, b));
        const finalA = diff > Math.PI ? Math.max(a, b) : Math.min(a, b);
        const finalB = diff > Math.PI ? Math.min(a, b) : Math.max(a, b);
        const group = drawnGroups[node.group!];
        const groupPos = toCanvasCoords(
          group.x,
          group.y,
          offsetX.value,
          offsetY.value,
          scaling.value,
        );
        ctx.arc(
          groupPos.x,
          groupPos.y,
          skillTree.constants.orbitRadii[node.orbit!] / scaling.value + 1,
          finalA,
          finalB,
        );
      }
      ctx.lineWidth = 6 / scaling.value;
      ctx.strokeStyle = "#524518";
      ctx.stroke();
    });
  });

  let circledNodePos: Point | undefined;
  if (props.circledNode) {
    circledNodePos = calculateNodePos(
      drawnNodes[props.circledNode],
      offsetX.value,
      offsetY.value,
      scaling.value,
    );
    ctx.strokeStyle = "#ad2b2b";
  }

  let newHoverNode: Node | undefined;
  let newHoverTreeNodeId: string | undefined;
  let hoveredNodeActive = false;
  Object.keys(drawnNodes).forEach((nodeId) => {
    const node = drawnNodes[Number(nodeId)];
    const rotatedPos = calculateNodePos(
      node,
      offsetX.value,
      offsetY.value,
      scaling.value,
    );
    let touchDistance = 0;

    let active = false;
    if (
      props.circledNode &&
      circledNodePos &&
      distance(rotatedPos, circledNodePos) < jewelRadius.value
    )
      active = true;
    if (node.skill != null && props.disabled?.indexOf(node.skill) >= 0)
      active = false;

    if (node.isKeystone) {
      touchDistance = 110;
      drawSprite(ctx, node.icon!, rotatedPos, active);
      drawSprite(
        ctx,
        active ? "KeystoneFrameAllocated" : "KeystoneFrameUnallocated",
        rotatedPos,
        false,
      );
    } else if (node.isNotable) {
      touchDistance = 70;
      drawSprite(ctx, node.icon!, rotatedPos, active);
      drawSprite(
        ctx,
        active ? "NotableFrameAllocated" : "NotableFrameUnallocated",
        rotatedPos,
        false,
      );
    } else if (node.isJewelSocket) {
      touchDistance = 70;
      drawSprite(
        ctx,
        active ? "JewelFrameAllocated" : "JewelFrameUnallocated",
        rotatedPos,
        false,
      );
    } else if (node.isMastery) {
      drawSprite(ctx, node.inactiveIcon!, rotatedPos, active);
    } else {
      touchDistance = 50;
      drawSprite(ctx, node.icon!, rotatedPos, active);
      drawSprite(
        ctx,
        active ? "PSSkillFrameActive" : "PSSkillFrame",
        rotatedPos,
        false,
      );
    }

    if (
      (props.highlighted?.length &&
        node.skill != null &&
        props.highlighted.indexOf(node.skill) >= 0) ||
      (props.highlightJewels && node.isJewelSocket)
    ) {
      ctx.strokeStyle = `hsl(${slowTime.value}, 100%, 50%)`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        rotatedPos.x,
        rotatedPos.y,
        (touchDistance + 30) / scaling.value,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    if (distance(rotatedPos, mousePos.value) < touchDistance / scaling.value) {
      newHoverNode = node;
      newHoverTreeNodeId = nodeId;
      hoveredNodeActive = active;
    }
  });

  hoveredNode.value = newHoverNode;

  if (props.circledNode && circledNodePos) {
    const JEWEL_RADIUS_SPRITES: Record<
      number,
      { default: string; inverse: string }
    > = {
      1: { default: "VaalJewelCircle1", inverse: "VaalJewelCircle2" },
      2: { default: "KaruiJewelCircle1", inverse: "KaruiJewelCircle2" },
      3: { default: "MarakethJewelCircle1", inverse: "MarakethJewelCircle2" },
      4: { default: "TemplarJewelCircle1", inverse: "TemplarJewelCircle2" },
      5: {
        default: "EternalEmpireJewelCircle1",
        inverse: "EternalEmpireJewelCircle2",
      },
      6: { default: "KalguurJewelCircle1", inverse: "KalguurJewelCircle2" },
    };

    const selectedJewelKey = (props.selectedJewel || 0) as number;
    const spriteInfo = (JEWEL_RADIUS_SPRITES[selectedJewelKey] as {
      default: string;
      inverse: string;
    }) || {
      default: "JewelCircle1",
      inverse: "JewelCircle1Inverse",
    };

    const drawRadiusSprite = (path: string) => {
      const sprite = inverseSprites[path];
      if (!sprite) return;
      const coords = sprite.coords[path];
      if (!coords) return;

      const spriteSheetUrl = resolveSpriteUrl(sprite.filename);
      if (!(spriteSheetUrl in spriteCache)) {
        const img = new Image();
        img.decoding = "async";
        spriteCache[spriteSheetUrl] = img;
        img.src = spriteSheetUrl;
      }
      const sheet = spriteCache[spriteSheetUrl];
      if (!isImageDrawable(sheet)) return;

      const radiusDrawWidth = (baseJewelRadius * 2) / scaling.value;
      const radiusDrawHeight = (baseJewelRadius * 2) / scaling.value;

      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(
        sheet,
        coords.x,
        coords.y,
        coords.w,
        coords.h,
        circledNodePos!.x - radiusDrawWidth / 2,
        circledNodePos!.y - radiusDrawHeight / 2,
        radiusDrawWidth,
        radiusDrawHeight,
      );
      ctx.restore();
    };

    drawRadiusSprite(spriteInfo.default);
    if (props.selectedJewel) {
      drawRadiusSprite(spriteInfo.inverse);
    }
  }

  const data = getData();

  const currentLang = props.lang ?? getLanguage();
  if (lastTooltipLang !== null && lastTooltipLang !== currentLang) {
    tooltipCache = null;
  }
  lastTooltipLang = currentLang;

  if (hoveredNode.value) {
    const isAlternate =
      !hoveredNode.value.isJewelSocket &&
      hoveredNodeActive &&
      !!props.seed &&
      !!props.selectedJewel &&
      !!props.selectedConqueror;
    const cacheKey = `${hoveredNode.value.skill ?? hoveredNode.value.name ?? ""}-${props.circledNode ?? ""}-${props.seed}-${props.selectedJewel}-${props.selectedConqueror}-${currentLang}-${hoveredNodeActive}`;
    let nodeName: string;
    let lines: TooltipLine[];

    const canUseCache = tooltipCache?.key === cacheKey && !isAlternate;
    if (canUseCache && tooltipCache) {
      nodeName = tooltipCache.data.nodeName;
      lines = tooltipCache.data.lines;
    } else {
      nodeName = hoveredNode.value.name ?? "";
      let nodeStats: { text: string; special: boolean }[] = [];

      let treeEntry: { Index: number } | undefined;
      let passiveSkill:
        | { PassiveSkillGraphID?: number; StatsKeys?: number[]; Name?: string }
        | undefined;
      if (hoveredNode.value.skill != null) {
        // treeEntry для WASM GetPassiveSkillByIndex и альтернативы (calculateTimelessForTreeSkill)
        treeEntry = data.TreeToPassive[hoveredNode.value.skill];
        if (treeEntry) {
          passiveSkill = data.GetPassiveSkillByIndex(treeEntry.Index);
        }
        // RU и не альтернатива — имя из лёгкого словаря с оф. сайта
        if (currentLang === "ru" && !isAlternate) {
          const ruNode = passiveNodeRu[String(hoveredNode.value.skill)];
          if (ruNode?.name) {
            nodeName = ruNode.name;
          } else if (passiveSkill?.PassiveSkillGraphID != null) {
            nodeName =
              translatePassiveSkillName(
                passiveSkill.PassiveSkillGraphID,
                nodeName,
                currentLang,
              ) || nodeName;
          }
        } else if (passiveSkill?.PassiveSkillGraphID != null) {
          nodeName =
            translatePassiveSkillName(
              passiveSkill.PassiveSkillGraphID,
              nodeName,
              currentLang,
            ) || nodeName;
        }
      }

      // Glorious Vanity (1) и Elegant Hubris (5) полностью заменяют описание ноды; кистоуны под самоцветом тоже только альтернатива, остальные ноды могут получать дополнение.
      const isReplaceOnlyJewel =
        props.selectedJewel === 1 || props.selectedJewel === 5;
      const isKeystoneUnderJewel =
        isAlternate && !!hoveredNode.value?.isKeystone;
      /** Heroic Tragedy (6): только нотаблы полностью меняют текст; мелкие — база + дополнения как у Lethal Pride. */
      const isHeroicTragedyNotableReplace =
        isAlternate &&
        props.selectedJewel === 6 &&
        !!hoveredNode.value?.isNotable;
      const needOriginalStats =
        hoveredNode.value.skill != null &&
        hoveredNode.value.stats?.length &&
        (nodeStats.length === 0 ||
          (isAlternate &&
            !isReplaceOnlyJewel &&
            !hoveredNode.value?.isKeystone &&
            !isHeroicTragedyNotableReplace));
      if (needOriginalStats && hoveredNode.value.skill != null) {
        const skill = hoveredNode.value.skill;
        const lang = currentLang;
        const ruNode = passiveNodeRu[String(skill)];
        // RU: статы из лёгкого словаря. Для альтернативы под не replace-only (Lethal Pride, Brutal Restraint, Militant Faith) нода не меняется — только дополнения; базу берём из ruNode, потом дополним из AlternatePassiveAdditionInformations.
        if (
          lang === "ru" &&
          ruNode?.stats?.length &&
          (!isAlternate ||
            (!isReplaceOnlyJewel && !isHeroicTragedyNotableReplace))
        ) {
          nodeStats = ruNode.stats.map((text) => ({ text, special: false }));
        } else {
          const treeEntryForStats = data.TreeToPassive[skill];
          const passiveForStats = treeEntryForStats
            ? data.GetPassiveSkillByIndex(treeEntryForStats.Index)
            : null;
          const statsKeysFromWasm = passiveForStats?.StatsKeys;
          const originals = hoveredNode.value.stats ?? [];

          // 1) Есть StatsKeys из WASM — берём stat по индексу, ключ stat.ID, перевод только из словаря по id.
          if (statsKeysFromWasm && statsKeysFromWasm.length > 0) {
            statsKeysFromWasm.forEach((statIndex, i) => {
              const stat = wasmStatRow(
                statIndex,
                `tooltip originals graphSkill=${skill} i=${i}`,
              );
              const rawLine = originals[i];
              const m = rawLine?.match(/([+-]?\d+(?:\.\d+)?)/);
              const roll = m ? parseFloat(m[1]) : undefined;
              const rolls = roll != null ? [roll] : [];
              let text: string;
              if (lang === "ru") {
                const template = statNamesRuByStringId[stat.ID];
                text = template
                  ? formatStatTemplate(template, rolls)
                  : statIdToDisplayFallback(stat.ID);
              } else {
                const template =
                  (stat.Text && /\{\d+\}/.test(stat.Text) ? stat.Text : null) ??
                  statTemplatesEnByStringId[stat.ID];
                text = template
                  ? formatStatTemplate(template, rolls)
                  : statIdToDisplayFallback(stat.ID);
              }
              nodeStats.push({ text, special: false });
            });
          } else {
            // 2) Нет WASM StatsKeys — ищем ключ по полному тексту (строки как один блок), потом перевод по id.
            let statId = getStatIdFromDisplayLines(originals);
            // Fallback по русскому названию только для одного стата (кистоун и т.п.); при нескольких статах один id подставляет чужое описание.
            if (
              !statId &&
              lang === "ru" &&
              nodeName &&
              originals.length === 1
            ) {
              statId = statIdByRuName[nodeName] ?? null;
            }
            if (statId && (lang !== "ru" || statNamesRuByStringId[statId])) {
              const rolls = originals.flatMap((s) =>
                extractRollsFromDisplayString(s),
              );
              const text =
                lang === "ru"
                  ? getStatTextById(statId, "ru", rolls)
                  : originals.join("\n");
              nodeStats.push({ text, special: false });
            } else {
              nodeStats = originals.map((s) => ({
                text: translateStatByDisplayString(s, lang),
                special: false,
              }));
            }
          }
        }
      }

      // Если нода под самоцветом — показываем статы от камня. Replace-only (Glorious Vanity, Elegant Hubris): только они; остальные: оригинал уже выше, дополняем.
      if (
        isAlternate &&
        props.seed &&
        props.selectedJewel &&
        props.selectedConqueror
      ) {
        const result =
          hoveredNode.value.skill != null
            ? calculateTimelessForTreeSkill(
                hoveredNode.value.skill,
                props.seed,
                props.selectedJewel,
                props.selectedConqueror,
              )
            : null;

        if (isTreeDebugEnabled() && hoveredNode.value.skill != null) {
          const dbgKey = `${newHoverTreeNodeId ?? "?"}-${hoveredNode.value.skill}-${props.circledNode}-${props.seed}-${props.selectedJewel}-${props.selectedConqueror}-${currentLang}-${hoveredNodeActive}`;
          if (dbgKey !== lastAltLogKey) {
            lastAltLogKey = dbgKey;
            treeDebugLog("alternate", {
              treeNodeId: newHoverTreeNodeId,
              skill: hoveredNode.value.skill,
              seed: props.seed,
              jewel: props.selectedJewel,
              conqueror: props.selectedConqueror,
              passiveIndex: treeEntry?.Index,
              trace: alternateLookupTraceForTreeSkill(
                hoveredNode.value.skill,
                props.seed,
                props.selectedJewel,
                props.selectedConqueror,
              ),
              calculate: result
                ? (() => {
                    const ap = result.AlternatePassiveSkill;
                    const altId = ap?.ID ?? "";
                    const altNameEn = ap?.Name ?? "";
                    /** Как в тултипе при RU: словарь id → RU, иначе keystoneLabel. altName в логе — всегда EN из WASM. */
                    const nameRu = altId
                      ? (passiveNamesRuById[altId] ??
                        keystoneLabel(altId, altNameEn, "ru") ??
                        altNameEn)
                      : (keystoneLabel(altNameEn, altNameEn, "ru") ??
                        altNameEn);
                    return {
                      hasAltSkill: !!ap,
                      altId: ap?.ID,
                      altName: altNameEn,
                      nameRu,
                      statRolls: result.StatRolls,
                      additions:
                        result.AlternatePassiveAdditionInformations?.length ??
                        0,
                    };
                  })()
                : null,
            });
          }
        }

        const altSkill = result?.AlternatePassiveSkill;
        const hasMeaningfulAlt =
          altSkill &&
          (altSkill.Name != null ||
            altSkill.ID != null ||
            (altSkill.StatsKeys?.length ?? 0) > 0);
        /** При полной замене тексты в SkillTree по skill id ещё старые (Acrobatics и т.д.) — не подставлять их вместо WASM-статов. */
        const skipSkillTreeLineFallbackForAltBody =
          isReplaceOnlyJewel ||
          isKeystoneUnderJewel ||
          isHeroicTragedyNotableReplace;

        if (hasMeaningfulAlt) {
          if (
            isReplaceOnlyJewel ||
            isKeystoneUnderJewel ||
            isHeroicTragedyNotableReplace
          )
            nodeStats = [];
          const altName = altSkill.Name;
          const altId = altSkill.ID ?? "";
          nodeName =
            currentLang === "ru"
              ? ((altId && passiveNamesRuById[altId]) ??
                keystoneLabel(altName, altName, "ru") ??
                altName)
              : altName;
          const pobLines = altId ? pobAltDisplayEn[altId] : undefined;
          /** PoB EN строки из JSON — для RU не брать их, если есть StatsKeys: иначе statNamesRu из passive_skill.json не используется. */
          const usePobEnTooltipLines =
            pobLines?.length &&
            !(currentLang === "ru" && (altSkill.StatsKeys?.length ?? 0) > 0);
          if (usePobEnTooltipLines) {
            pobLines!.forEach((line) => {
              nodeStats.push({
                text: line,
                special: !isHeroicTragedyNotableReplace,
              });
            });
          } else {
            altSkill.StatsKeys?.forEach((statId, i) => {
              const stat = wasmStatRow(
                statId,
                `AlternatePassiveSkill id=${altId} graphSkill=${hoveredNode.value?.skill} i=${i}`,
              );
              const tr = inverseTranslations[stat.ID];
              const roll = wasmStatRoll(result.StatRolls, i);
              const lang = currentLang;
              let text: string;
              if (lang === "ru") {
                const displayRoll =
                  roll != null
                    ? displayRollForStatTemplate(stat.ID, roll)
                    : undefined;
                const rollArr = displayRoll != null ? [displayRoll] : [];
                const ruLine = formatRuStatLineFromWasm(
                  stat.ID,
                  stat.Text,
                  rollArr,
                );
                if (ruLine) {
                  text = ruLine;
                } else if (tr)
                  text =
                    (roll != null ? formatStats(tr, roll) : stat.ID) || stat.ID;
                else if (stat.Text && /\{\d+\}/.test(stat.Text))
                  text = formatStatTemplate(
                    stat.Text,
                    roll != null ? [roll] : [],
                  );
                else if (statTemplatesEnByStringId[stat.ID])
                  text = formatStatTemplate(
                    statTemplatesEnByStringId[stat.ID],
                    roll != null ? [roll] : [],
                  );
                else {
                  text = translateStat(statId, roll);
                  if (text === stat.ID) text = statIdToDisplayFallback(stat.ID);
                }
              } else if (tr)
                text =
                  (roll != null ? formatStats(tr, roll) : stat.ID) || stat.ID;
              else if (stat.Text && /\{\d+\}/.test(stat.Text))
                text = formatStatTemplate(
                  stat.Text,
                  roll != null ? [roll] : [],
                );
              else if (statTemplatesEnByStringId[stat.ID])
                text = formatStatTemplate(
                  statTemplatesEnByStringId[stat.ID],
                  roll != null ? [roll] : [],
                );
              else {
                text = translateStat(statId, roll);
                if (text === stat.ID) text = statIdToDisplayFallback(stat.ID);
              }
              const keysLenAlt = altSkill.StatsKeys?.length ?? 0;
              const treeLinesAlt = skipSkillTreeLineFallbackForAltBody
                ? null
                : graphAlternateStatLinesFromSkillTree(
                    hoveredNode.value?.skill,
                    hoveredNode.value,
                    lang,
                    i,
                    keysLenAlt,
                  );
              if (
                treeLinesAlt &&
                hoveredNode.value &&
                tooltipTextLooksLikeUnresolvedStatSlug(text, stat.ID, stat.Text)
              ) {
                text = treeLinesAlt;
              }
              nodeStats.push({
                text,
                special: !isHeroicTragedyNotableReplace,
              });
            });
          }
        } else if (
          result &&
          hoveredNode.value.skill != null &&
          (isReplaceOnlyJewel ||
            isKeystoneUnderJewel ||
            isHeroicTragedyNotableReplace)
        ) {
          // Калькулятор вернул пустой AlternatePassiveSkill — показываем оригинал. Если есть StatRolls и известны статы ноды (StatsKeys), собираем строки по id с роллами; иначе берём ruNode.
          const ruNodeFallback = passiveNodeRu[String(hoveredNode.value.skill)];
          const statsKeys = passiveSkill?.StatsKeys;
          const rolls = result.StatRolls;
          if (
            statsKeys?.length &&
            rolls != null &&
            Object.keys(rolls).length >= statsKeys.length
          ) {
            nodeStats = [];
            statsKeys.forEach((statIndex, i) => {
              const stat = wasmStatRow(
                statIndex,
                `empty alt fallback graphSkill=${hoveredNode.value?.skill} i=${i}`,
              );
              const roll = wasmStatRoll(rolls, i);
              const rollArr =
                roll != null ? [displayRollForStatTemplate(stat.ID, roll)] : [];
              let text: string;
              if (currentLang === "ru") {
                const ruLine = formatRuStatLineFromWasm(
                  stat.ID,
                  stat.Text,
                  rollArr,
                );
                if (ruLine) {
                  text = ruLine;
                } else {
                  const template =
                    (stat.Text && /\{\d+\}/.test(stat.Text)
                      ? stat.Text
                      : null) ?? statTemplatesEnByStringId[stat.ID];
                  text = template
                    ? formatStatTemplate(template, rollArr)
                    : statIdToDisplayFallback(stat.ID);
                }
              } else {
                const template =
                  (stat.Text && /\{\d+\}/.test(stat.Text) ? stat.Text : null) ??
                  statTemplatesEnByStringId[stat.ID];
                text = template
                  ? formatStatTemplate(template, rollArr)
                  : statIdToDisplayFallback(stat.ID);
              }
              nodeStats.push({ text, special: false });
            });
            if (ruNodeFallback?.name) nodeName = ruNodeFallback.name;
          } else {
            if (ruNodeFallback?.name) nodeName = ruNodeFallback.name;
            if (ruNodeFallback?.stats?.length)
              nodeStats = ruNodeFallback.stats.map((text) => ({
                text,
                special: false,
              }));
          }
        }
        if (!isHeroicTragedyNotableReplace) {
          result?.AlternatePassiveAdditionInformations?.forEach((info) => {
            info.AlternatePassiveAddition?.StatsKeys?.forEach((statId, i) => {
              const stat = wasmStatRow(
                statId,
                `AlternatePassiveAddition graphSkill=${hoveredNode.value?.skill} i=${i}`,
              );
              const tr = inverseTranslations[stat.ID];
              const roll = wasmStatRoll(info.StatRolls, i);
              const lang = currentLang;
              let text: string;
              if (lang === "ru") {
                const displayRoll =
                  roll != null
                    ? displayRollForStatTemplate(stat.ID, roll)
                    : undefined;
                const rollArr = displayRoll != null ? [displayRoll] : [];
                const ruLine = formatRuStatLineFromWasm(
                  stat.ID,
                  stat.Text,
                  rollArr,
                );
                if (ruLine) {
                  text = ruLine;
                } else if (tr)
                  text =
                    (roll != null ? formatStats(tr, roll) : stat.ID) || stat.ID;
                else if (stat.Text && /\{\d+\}/.test(stat.Text))
                  text = formatStatTemplate(
                    stat.Text,
                    roll != null ? [roll] : [],
                  );
                else if (statTemplatesEnByStringId[stat.ID])
                  text = formatStatTemplate(
                    statTemplatesEnByStringId[stat.ID],
                    roll != null ? [roll] : [],
                  );
                else {
                  text = translateStat(statId, roll);
                  if (text === stat.ID) text = statIdToDisplayFallback(stat.ID);
                }
              } else if (tr)
                text =
                  (roll != null ? formatStats(tr, roll) : stat.ID) || stat.ID;
              else if (stat.Text && /\{\d+\}/.test(stat.Text))
                text = formatStatTemplate(
                  stat.Text,
                  roll != null ? [roll] : [],
                );
              else if (statTemplatesEnByStringId[stat.ID])
                text = formatStatTemplate(
                  statTemplatesEnByStringId[stat.ID],
                  roll != null ? [roll] : [],
                );
              else {
                text = translateStat(statId, roll);
                if (text === stat.ID) text = statIdToDisplayFallback(stat.ID);
              }
              const keysLenAdd =
                info.AlternatePassiveAddition?.StatsKeys?.length ?? 0;
              const treeLinesAdd = graphAlternateStatLinesFromSkillTree(
                hoveredNode.value?.skill,
                hoveredNode.value,
                lang,
                i,
                keysLenAdd,
              );
              if (
                treeLinesAdd &&
                hoveredNode.value &&
                tooltipTextLooksLikeUnresolvedStatSlug(text, stat.ID, stat.Text)
              ) {
                text = treeLinesAdd;
              }
              nodeStats.push({ text, special: true });
            });
          });
        }

        if (
          hoveredNode.value.skill != null &&
          isPassiveSkillStub(getPassiveRowByTreeSkill(hoveredNode.value.skill))
        ) {
          nodeStats.unshift({
            text:
              currentLang === "ru"
                ? "⚠ Заглушка passive_skills (дерево новее дампа). Обновите data/passive_skills*.gz из GGPK/PyPoE: npm run import:pypoe-bundle … → npm run prepare:wasm-data && npm run wasm:build"
                : "⚠ Stub passive_skills row. Refresh data/passive_skills from your export: npm run import:pypoe-bundle … then npm run prepare:wasm-data && npm run wasm:build",
            special: false,
          });
        }
      }

      // Fallback: оригинальные статы только если не replace-only самоцвет (для него показываем только то, что вернул калькулятор).
      if (
        nodeStats.length === 0 &&
        hoveredNode.value.stats &&
        !(isAlternate && isReplaceOnlyJewel) &&
        !(isAlternate && isHeroicTragedyNotableReplace)
      ) {
        const lang = currentLang;
        nodeStats = hoveredNode.value.stats.map((s) => ({
          text: translateStatByDisplayString(s, lang),
          special: false,
        }));
      }

      lines = [];
      if (nodeStats.length > 0) {
        nodeStats.forEach((stat) => {
          pushTooltipLines(lines, stat.text, stat.special);
        });
      } else if (hoveredNode.value.isJewelSocket) {
        lines.push({
          text: ui("clickToSelectSocket", currentLang),
          special: true,
        });
      }

      tooltipCache = { key: cacheKey, data: { nodeName, lines } };
    }

    tooltipContent.value = { nodeName, lines };
    const anchor = calculateNodePos(
      hoveredNode.value,
      offsetX.value,
      offsetY.value,
      scaling.value,
    );
    const anchorX = clampTooltipAnchorX(anchor.x, w);
    tooltipStyle.value = tooltipPlacementStyle(
      { x: anchorX, y: anchor.y },
      h,
    );
  } else {
    tooltipContent.value = null;
    tooltipStyle.value = null;
  }

  cursor.value = hoveredNode.value?.isJewelSocket ? "pointer" : "unset";

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.font = "12px Roboto Mono";
  ctx.fillText(`${(performance.now() - start).toFixed(1)}ms`, w - 5, 17);
}

function loop() {
  if ((props.highlighted?.length || 0) > 0 || props.highlightJewels) {
    slowTime.value = Math.round(animFrame / 40);
    animFrame++;
  }
  render();
  rafId = requestAnimationFrame(loop);
}

function onResize() {
  width.value = window.innerWidth;
  height.value = window.innerHeight;
  if (canvasRef.value) {
    canvasRef.value.width = width.value;
    canvasRef.value.height = height.value;
  }
}

function updateMousePos(e: { clientX: number; clientY: number }) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  mousePos.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onPointerDown(e: MouseEvent) {
  down.value = true;
  downX.value = e.clientX;
  downY.value = e.clientY;
  startX.value = offsetX.value;
  startY.value = offsetY.value;
  updateMousePos(e);
  if (hoveredNode.value) emit("clickNode", hoveredNode.value);
}

function onPointerUp(e: PointerEvent) {
  if (e.type === "pointerup") down.value = false;
  updateMousePos(e);
}

function onPointerMove(e: MouseEvent) {
  if (down.value) {
    offsetX.value = startX.value - (downX.value - e.clientX) * scaling.value;
    offsetY.value = startY.value - (downY.value - e.clientY) * scaling.value;
  }
  if ((e.target as Element).closest?.("[data-tree-menu]")) {
    mousePos.value = { x: Number.MIN_VALUE, y: Number.MIN_VALUE };
    return;
  }
  updateMousePos(e);
}

function onWheel(e: WheelEvent) {
  if (e.deltaY > 0 && scaling.value < 30) {
    offsetX.value += e.offsetX;
    offsetY.value += e.offsetY;
  }
  if (e.deltaY < 0 && scaling.value > 3) {
    offsetX.value -= e.offsetX;
    offsetY.value -= e.offsetY;
  }
  scaling.value = Math.min(30, Math.max(3, scaling.value + e.deltaY / 100));
  e.preventDefault();
  e.stopPropagation();
}

watch(
  () => [
    props.circledNode,
    props.seed,
    props.highlighted,
    props.highlightJewels,
  ],
  () => {},
  { deep: true },
);

function bindWheel() {
  const el = canvasRef.value;
  if (!el) return;
  el.addEventListener("wheel", onWheel, { passive: false });
}

function unbindWheel() {
  const el = canvasRef.value;
  if (!el) return;
  el.removeEventListener("wheel", onWheel);
}

onMounted(() => {
  if (skillTree && !initialized.value) {
    initialized.value = true;
    offsetX.value = skillTree.min_x + (window.innerWidth / 2) * scaling.value;
    offsetY.value = skillTree.min_y + (window.innerHeight / 2) * scaling.value;
  }
  onResize();
  window.addEventListener("resize", onResize);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
  nextTick(bindWheel);
  rafId = requestAnimationFrame(loop);
});

onUnmounted(() => {
  cancelAnimationFrame(rafId);
  unbindWheel();
  window.removeEventListener("resize", onResize);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointermove", onPointerMove);
});
</script>

<template>
  <div v-if="width && height" class="canvas-wrap" :style="{ cursor }">
    <canvas
      ref="canvasRef"
      :width="width"
      :height="height"
      style="touch-action: none; display: block"
      @pointerdown="onPointerDown"
    />
    <TreeTooltip
      v-if="tooltipContent && tooltipStyle"
      :title="tooltipContent.nodeName"
      :lines="tooltipContent.lines"
      :style="tooltipStyle"
    />
  </div>
</template>

<style scoped>
.canvas-wrap {
  min-width: 100vw;
  min-height: 100vh;
  overflow: hidden;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
}
</style>
