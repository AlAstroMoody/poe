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
} from "@/lib/skill_tree";
import { getData, getCalculator } from "@/services/wasmDataService";
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
  extractRollsFromDisplayString,
  statIdByRuName,
  ui,
} from "@/lib/dict";
import { BASE_DATA_URL } from "@/config";

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
  allLines: { text: string; offset: number; special: boolean }[];
  maxWidth: number;
};
let tooltipCache: { key: string; data: TooltipCache } | null = null;
let lastTooltipLang: "ru" | "en" | null = null;
let lastAltLogKey: string | null = null;

/** Когда нет шаблона/перевода — показываем id в читаемом виде вместо сырого "cold_damage_+%". */
function statIdToDisplayFallback(statId: string): string {
  return statId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const jewelRadius = computed(() => baseJewelRadius / scaling.value);
const startGroups = [427, 320, 226, 227, 323, 422, 329];
const titleFont = "25px Roboto Mono";
const statsFont = "17px Roboto Mono";
const drawScaling = 2.6;

const spriteCache: Record<string, HTMLImageElement> = {};
const spriteCacheActive: Record<string, HTMLImageElement> = {};

function resolveSpriteUrl(filename: string): string {
  if (filename.startsWith("http")) return filename;
  const base = BASE_DATA_URL.replace(/\/$/, "");
  return filename.startsWith("/") ? base + filename : base + "/" + filename;
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
    cache[spriteSheetUrl] = new Image();
    cache[spriteSheetUrl].src = spriteSheetUrl;
  }
  const self = sprite.coords[path];
  if (!self) return;

  const newWidth = (self.w / scaling.value) * drawScaling;
  const newHeight = (self.h / scaling.value) * drawScaling;
  const topLeftX = pos.x - newWidth / 2;
  const topLeftY = pos.y - newHeight / 2;
  let finalY = mirrored ? topLeftY - newHeight / 2 : topLeftY;

  context.drawImage(
    cache[spriteSheetUrl],
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
      cache[spriteSheetUrl],
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

function wrapText(
  text: string,
  context: CanvasRenderingContext2D,
  maxWidth: number,
): string[] {
  const result: string[] = [];
  let currentWord = "";
  text.split(" ").forEach((word) => {
    if (context.measureText(currentWord + word).width < maxWidth) {
      currentWord += (currentWord ? " " : "") + word;
    } else {
      if (currentWord) result.push(currentWord.trim());
      currentWord = word;
    }
  });
  if (currentWord) result.push(currentWord.trim());
  return result;
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
      hoveredNodeActive = active;
    }
  });

  hoveredNode.value = newHoverNode;

  if (props.circledNode && circledNodePos) {
    ctx.strokeStyle = "#ad2b2b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(
      circledNodePos.x,
      circledNodePos.y,
      jewelRadius.value,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  const data = getData();
  const calculator = getCalculator();

  const currentLang = props.lang ?? getLanguage();
  if (lastTooltipLang !== null && lastTooltipLang !== currentLang) {
    tooltipCache = null;
  }
  lastTooltipLang = currentLang;

  if (hoveredNode.value) {
    const padding = 30;
    const isAlternate =
      !hoveredNode.value.isJewelSocket &&
      hoveredNodeActive &&
      !!props.seed &&
      !!props.selectedJewel &&
      !!props.selectedConqueror;
    const cacheKey = `${hoveredNode.value.skill ?? hoveredNode.value.name ?? ""}-${props.circledNode ?? ""}-${props.seed}-${props.selectedJewel}-${props.selectedConqueror}-${currentLang}-${hoveredNodeActive}`;
    let nodeName: string;
    let allLines: { text: string; offset: number; special: boolean }[];
    let maxWidth: number;

    const canUseCache = tooltipCache?.key === cacheKey && !isAlternate;
    if (canUseCache && tooltipCache) {
      nodeName = tooltipCache.data.nodeName;
      allLines = tooltipCache.data.allLines;
      maxWidth = tooltipCache.data.maxWidth;
    } else {
      nodeName = hoveredNode.value.name ?? "";
      let nodeStats: { text: string; special: boolean }[] = [];

      let treeEntry: { Index: number } | undefined;
      let passiveSkill:
        | { PassiveSkillGraphID?: number; StatsKeys?: number[]; Name?: string }
        | undefined;
      if (hoveredNode.value.skill != null) {
        // treeEntry всегда нужен для блока альтернативы (calculator.Calculate)
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
      const needOriginalStats =
        hoveredNode.value.skill != null &&
        hoveredNode.value.stats?.length &&
        (nodeStats.length === 0 ||
          (isAlternate &&
            !isReplaceOnlyJewel &&
            !hoveredNode.value?.isKeystone));
      if (needOriginalStats && hoveredNode.value.skill != null) {
        const skill = hoveredNode.value.skill;
        const lang = currentLang;
        const ruNode = passiveNodeRu[String(skill)];
        // RU: статы из лёгкого словаря. Для альтернативы под не replace-only (Lethal Pride, Brutal Restraint, Militant Faith) нода не меняется — только дополнения; базу берём из ruNode, потом дополним из AlternatePassiveAdditionInformations.
        if (
          lang === "ru" &&
          ruNode?.stats?.length &&
          (!isAlternate || !isReplaceOnlyJewel)
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
              const stat = data.GetStatByIndex(statIndex);
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
          treeEntry != null
            ? calculator.Calculate(
                treeEntry.Index,
                props.seed,
                props.selectedJewel,
                props.selectedConqueror,
              )
            : null;
        const altSkill = result?.AlternatePassiveSkill;
        const hasMeaningfulAlt =
          altSkill &&
          (altSkill.Name != null ||
            altSkill.ID != null ||
            (altSkill.StatsKeys?.length ?? 0) > 0);
        if (hasMeaningfulAlt) {
          if (isReplaceOnlyJewel || isKeystoneUnderJewel) nodeStats = [];
          const altName = altSkill.Name;
          const altId = altSkill.ID;
          nodeName =
            currentLang === "ru"
              ? ((altId && passiveNamesRuById[altId]) ??
                keystoneLabel(altName, altName, "ru") ??
                altName)
              : altName;
          altSkill.StatsKeys?.forEach((statId, i) => {
            const stat = data.GetStatByIndex(statId);
            const tr = inverseTranslations[stat.ID];
            const roll = result.StatRolls?.[i];
            const lang = currentLang;
            let text: string;
            // При RU сначала русский шаблон, иначе при смене EN→RU остаётся inverseTranslations (EN)
            if (lang === "ru" && statNamesRuByStringId[stat.ID]) {
              text = formatStatTemplate(
                statNamesRuByStringId[stat.ID],
                roll != null ? [roll] : [],
              );
            } else if (tr)
              text =
                (roll != null ? formatStats(tr, roll) : stat.ID) || stat.ID;
            else if (stat.Text && /\{\d+\}/.test(stat.Text))
              text = formatStatTemplate(stat.Text, roll != null ? [roll] : []);
            else if (statTemplatesEnByStringId[stat.ID])
              text = formatStatTemplate(
                statTemplatesEnByStringId[stat.ID],
                roll != null ? [roll] : [],
              );
            else {
              text = translateStat(statId, roll);
              if (text === stat.ID) text = statIdToDisplayFallback(stat.ID);
            }
            nodeStats.push({ text, special: true });
          });
        } else if (
          result &&
          hoveredNode.value.skill != null &&
          (isReplaceOnlyJewel || isKeystoneUnderJewel)
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
              const stat = data.GetStatByIndex(statIndex);
              const roll = (rolls as Record<number, number>)[i];
              const rollArr = roll != null ? [roll] : [];
              let text: string;
              if (currentLang === "ru" && statNamesRuByStringId[stat.ID]) {
                text = formatStatTemplate(
                  statNamesRuByStringId[stat.ID],
                  rollArr,
                );
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
        result?.AlternatePassiveAdditionInformations?.forEach((info) => {
          info.AlternatePassiveAddition?.StatsKeys?.forEach((statId, i) => {
            const stat = data.GetStatByIndex(statId);
            const tr = inverseTranslations[stat.ID];
            const roll = info.StatRolls?.[i];
            const lang = currentLang;
            let text: string;
            if (lang === "ru" && statNamesRuByStringId[stat.ID])
              text = formatStatTemplate(
                statNamesRuByStringId[stat.ID],
                roll != null ? [roll] : [],
              );
            else if (tr)
              text =
                (roll != null ? formatStats(tr, roll) : stat.ID) || stat.ID;
            else if (stat.Text && /\{\d+\}/.test(stat.Text))
              text = formatStatTemplate(stat.Text, roll != null ? [roll] : []);
            else if (statTemplatesEnByStringId[stat.ID])
              text = formatStatTemplate(
                statTemplatesEnByStringId[stat.ID],
                roll != null ? [roll] : [],
              );
            else {
              text = translateStat(statId, roll);
              if (text === stat.ID) text = statIdToDisplayFallback(stat.ID);
            }
            nodeStats.push({ text, special: true });
          });
        });
      }

      // Fallback: оригинальные статы только если не replace-only самоцвет (для него показываем только то, что вернул калькулятор).
      if (
        nodeStats.length === 0 &&
        hoveredNode.value.stats &&
        !(isAlternate && isReplaceOnlyJewel)
      ) {
        const lang = currentLang;
        nodeStats = hoveredNode.value.stats.map((s) => ({
          text: translateStatByDisplayString(s, lang),
          special: false,
        }));
      }

      ctx.font = titleFont;
      maxWidth = Math.max(ctx.measureText(nodeName).width + 50, 600);
      ctx.font = statsFont;

      allLines = [];
      let offset = 85;

      if (nodeStats.length > 0) {
        nodeStats.forEach((stat) => {
          if (allLines.length > 0) offset += 5;
          stat.text
            .replace(/\\n/g, "\n")
            .split("\n")
            .forEach((line) => {
              if (allLines.length > 0) offset += 10;
              wrapText(line, ctx, maxWidth - padding).forEach((l) => {
                allLines.push({ text: l, offset, special: stat.special });
                offset += 20;
              });
            });
        });
      } else if (hoveredNode.value.isJewelSocket) {
        allLines.push({
          text: ui("clickToSelectSocket", currentLang),
          offset,
          special: true,
        });
        offset += 20;
      }

      tooltipCache = { key: cacheKey, data: { nodeName, allLines, maxWidth } };
    }

    const titleHeight = 55;
    const contentBottom = allLines.length
      ? allLines[allLines.length - 1].offset + 20
      : titleHeight;

    ctx.fillStyle = "rgba(75,63,24,0.9)";
    ctx.fillRect(mousePos.value.x, mousePos.value.y, maxWidth, titleHeight);
    ctx.fillStyle = "#ffffff";
    ctx.font = titleFont;
    ctx.textAlign = "center";
    ctx.fillText(
      nodeName,
      mousePos.value.x + maxWidth / 2,
      mousePos.value.y + 35,
    );
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(
      mousePos.value.x,
      mousePos.value.y + titleHeight,
      maxWidth,
      contentBottom - titleHeight,
    );
    ctx.font = statsFont;
    ctx.textAlign = "left";
    allLines.forEach((l) => {
      ctx.fillStyle = l.special ? "#8cf34c" : "#ffffff";
      ctx.fillText(
        l.text,
        mousePos.value.x + padding / 2,
        mousePos.value.y + l.offset,
      );
    });
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
  </div>
</template>

<style scoped>
.canvas-wrap {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
