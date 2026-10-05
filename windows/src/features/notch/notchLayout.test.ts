import { describe, expect, it } from "vitest";
import { boundingRect, bodyRect, centerAlong, maxLength, windowFrame } from "./notchGeometry";
import { boundingRectFor, hotRect, maxPanelSize, type NotchLayout } from "./notchLayout";
import { clampPanelSize, defaultExpandedSize, notchScale, stripMetrics } from "../../theme/notchMetrics";

describe("notchGeometry (WindowCustomizationTests)", () => {
  it("topEdgeRects", () => {
    const win = { width: 1000, height: 500 };
    expect(bodyRect("top", win, 40, 200, 500)).toEqual({ x: 400, y: 0, width: 200, height: 40 });
    expect(boundingRect("top", win, 40, 200, 10, 500)).toEqual({ x: 390, y: 0, width: 220, height: 40 });
    expect(bodyRect("right", win, 40, 200, 250)).toEqual({ x: 960, y: 150, width: 40, height: 200 });
    expect(boundingRect("left", win, 40, 200, 10, 250)).toEqual({ x: 0, y: 140, width: 40, height: 220 });
    expect(centerAlong(100, true, 80)).toBe(140);
    expect(centerAlong(100, false, 80)).toBe(100);
  });

  it("topWindowFrame (top-left origin)", () => {
    const frame = { x: 0, y: 0, width: 1500, height: 900 };
    const visible = { x: 0, y: 0, width: 1500, height: 840 };
    const size = { width: 1000, height: 500 };
    expect(windowFrame("top", frame, visible, size, 750)).toEqual({ x: 250, y: 0, ...size });
    const clamped = windowFrame("top", frame, visible, size, 1400, true);
    expect(clamped.x + clamped.width).toBe(1500);
    const side = windowFrame("right", frame, visible, { width: 400, height: 640 }, 0);
    expect(side).toEqual({ x: 1100, y: 100, width: 400, height: 640 });
  });

  it("maxLengthKeepsFlaresInside", () => {
    const leading = maxLength(1020, 368, true, 24);
    expect(leading).toBe(620);
    expect(368 + leading + 24).toBeLessThanOrEqual(1020);
    expect(maxLength(879, 439.5, false, 24)).toBe(815);
    expect(maxLength(1000, 100, false, 20)).toBe(144);
    expect(maxLength(40, 20, false, 24)).toBe(0);
  });
});

const sc = notchScale("medium");
const layout = (edge: "left" | "right" | "top"): NotchLayout => ({
  edge,
  windowSize: edge === "top" ? { width: 1020, height: 700 } : { width: 900, height: 800 },
  pinCount: 5,
  expandedSize: defaultExpandedSize(edge, 1),
  anchor: edge === "top" ? 510 : 400,
  expandedCenter: 400,
  pillStyle: "line",
  scale: sc,
  fontScale: 1,
});

describe("notch metrics", () => {
  it("strip length for 5 icons", () => {
    // 2*14 + (28+8+6) + 5*28 + 4*8 + (8+28)
    expect(stripMetrics(5, sc).length).toBe(28 + 42 + 140 + 32 + 36);
  });
  it("hot rect is the bounding rect padded by 30", () => {
    const l = layout("right");
    const r = hotRect(l, "strip");
    const b = boundingRectFor(l, "strip");
    expect(r).toEqual({ x: b.x - 30, y: b.y - 30, width: b.width + 60, height: b.height + 60 });
  });
  it("resting hot rect ignores the pill style", () => {
    const a = hotRect({ ...layout("right"), pillStyle: "dot" }, "resting");
    const b = hotRect({ ...layout("right"), pillStyle: "line" }, "resting");
    expect(a).toEqual(b);
  });
  it("max panel size keeps flares inside", () => {
    expect(maxPanelSize(layout("right"))).toEqual({ width: 900, height: 2 * (400 - 20 - 8) });
    expect(maxPanelSize(layout("top")).width).toBe(2 * (510 - 20 - 8));
  });
  it("panel size clamps", () => {
    expect(clampPanelSize({ width: 100, height: 100 }, 900, 800)).toEqual({ width: 300, height: 240 });
    expect(clampPanelSize({ width: 2000, height: 2000 }, 900, 800)).toEqual({ width: 900, height: 800 });
  });
});
