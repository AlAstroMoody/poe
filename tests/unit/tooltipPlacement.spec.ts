import { describe, expect, it } from "vitest";
import {
  clampTooltipAnchorX,
  maxTooltipWidthForViewport,
  tooltipPlacementStyle,
} from "@/lib/tooltipPlacement";

describe("maxTooltipWidthForViewport", () => {
  it("ограничен 28rem (448px) на широком экране", () => {
    expect(maxTooltipWidthForViewport(1200)).toBe(448);
    expect(maxTooltipWidthForViewport(768)).toBe(448);
  });

  it("ужимается по viewport с учётом полей", () => {
    expect(maxTooltipWidthForViewport(400)).toBe(380); // 400 - 20
  });

  it("не опускается ниже 160px", () => {
    expect(maxTooltipWidthForViewport(100)).toBe(160);
  });
});

describe("clampTooltipAnchorX", () => {
  it("прижимает к левому и правому краю", () => {
    expect(clampTooltipAnchorX(100, 1000)).toBe(236); // margin 12 + half 224
    expect(clampTooltipAnchorX(900, 1000)).toBe(764); // 1000 - 12 - 224
  });

  it("оставляет якорь в середине без изменений", () => {
    expect(clampTooltipAnchorX(500, 1000)).toBe(500);
  });

  it("центрирует, когда поля перекрываются (узкий viewport)", () => {
    expect(clampTooltipAnchorX(100, 450)).toBe(225); // viewportW / 2
  });
});

describe("tooltipPlacementStyle", () => {
  it("над нодой по умолчанию при anchor.y >= 160", () => {
    const style = tooltipPlacementStyle({ x: 10, y: 300 }, 800);
    expect(style.left).toBe("10px");
    expect(style.top).toBe("300px");
    expect(style.transform).toBe("translate(-50%, calc(-100% - 14px))");
    expect(style.maxWidth).toBeUndefined();
  });

  it("переворачивается вниз у верхней кромки (anchor.y < 160)", () => {
    const style = tooltipPlacementStyle({ x: 10, y: 100 }, 800);
    expect(style.transform).toBe("translate(-50%, 14px)");
  });

  it("проставляет maxWidth, если передан viewportW", () => {
    const style = tooltipPlacementStyle({ x: 10, y: 100 }, 800, 1000);
    expect(style.maxWidth).toBe("448px");
  });

  it("уважает явный flipBelow", () => {
    const style = tooltipPlacementStyle({ x: 0, y: 100 }, 800, undefined, false);
    expect(style.transform).toBe("translate(-50%, calc(-100% - 14px))");
  });
});
