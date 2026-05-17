import type { Point } from "@/lib/skill_tree";

/** Anchor tooltip above node; flip below if too close to top edge. */
export function tooltipPlacementStyle(
  anchor: Point,
  viewportH: number,
  flipBelow = anchor.y < 160,
): Record<string, string> {
  const gap = 14;
  if (flipBelow) {
    return {
      left: `${anchor.x}px`,
      top: `${anchor.y}px`,
      transform: `translate(-50%, ${gap}px)`,
    };
  }
  return {
    left: `${anchor.x}px`,
    top: `${anchor.y}px`,
    transform: `translate(-50%, calc(-100% - ${gap}px))`,
  };
}

export function maxTooltipWidthForViewport(viewportW: number): number {
  if (viewportW < 768) return Math.max(280, viewportW - 32);
  return Math.min(448, viewportW - 24);
}

export function clampTooltipAnchorX(
  anchorX: number,
  viewportW: number,
  maxTooltipWidth = maxTooltipWidthForViewport(viewportW),
): number {
  const margin = 12;
  const half = maxTooltipWidth / 2;
  return Math.max(margin + half, Math.min(anchorX, viewportW - margin - half));
}
