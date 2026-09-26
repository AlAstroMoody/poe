import type { Point } from "@/lib/skill_tree";

/** Совпадает с max-w тултипа: min(28rem, viewport − поля). */
export function maxTooltipWidthForViewport(viewportW: number): number {
  const gutter = viewportW < 768 ? 20 : 24;
  return Math.min(448, Math.max(160, viewportW - gutter));
}

export function clampTooltipAnchorX(
  anchorX: number,
  viewportW: number,
  maxTooltipWidth = maxTooltipWidthForViewport(viewportW),
): number {
  const margin = viewportW < 768 ? 10 : 12;
  const half = maxTooltipWidth / 2;
  const minX = margin + half;
  const maxX = viewportW - margin - half;
  if (minX >= maxX) return viewportW / 2;
  return Math.max(minX, Math.min(anchorX, maxX));
}

/** Anchor tooltip above node; flip below if too close to top edge. */
export function tooltipPlacementStyle(
  anchor: Point,
  viewportH: number,
  viewportW?: number,
  flipBelow = anchor.y < 160,
): Record<string, string> {
  const gap = 14;
  const maxW =
    viewportW != null ? maxTooltipWidthForViewport(viewportW) : undefined;
  const base: Record<string, string> = flipBelow
    ? {
        left: `${anchor.x}px`,
        top: `${anchor.y}px`,
        transform: `translate(-50%, ${gap}px)`,
      }
    : {
        left: `${anchor.x}px`,
        top: `${anchor.y}px`,
        transform: `translate(-50%, calc(-100% - ${gap}px))`,
      };
  if (maxW != null) {
    base.maxWidth = `${maxW}px`;
  }
  return base;
}
