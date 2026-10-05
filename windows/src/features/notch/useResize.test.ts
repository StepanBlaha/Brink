import { describe, expect, it } from "vitest";
import { gripFrames } from "./ResizeGrips";
import { resizedSize } from "./useResize";

const start = { width: 400, height: 560 };

describe("resizedSize", () => {
  it("right edge: dragging left widens, corners change length 2x", () => {
    expect(resizedSize("right", "farEdge", start, -50, 30)).toEqual({ width: 450, height: 560 });
    expect(resizedSize("right", "cornerA", start, -50, 30)).toEqual({ width: 450, height: 500 });
    expect(resizedSize("right", "cornerB", start, -50, 30)).toEqual({ width: 450, height: 620 });
  });
  it("left edge: dragging right widens", () => {
    expect(resizedSize("left", "farEdge", start, 40, 0)).toEqual({ width: 440, height: 560 });
    expect(resizedSize("left", "cornerB", start, 40, 10).height).toBe(580);
  });
  it("top edge: dragging down deepens, corners change width 2x", () => {
    expect(resizedSize("top", "farEdge", start, 10, 25)).toEqual({ width: 400, height: 585 });
    expect(resizedSize("top", "cornerB", start, 10, 25)).toEqual({ width: 420, height: 585 });
    expect(resizedSize("top", "cornerA", start, 10, 25).width).toBe(380);
  });
});

describe("gripFrames", () => {
  it("uses a 6 px edge and 18 px corners on the far side", () => {
    const f = gripFrames("right", { x: 100, y: 50, width: 400, height: 500 });
    expect(f.farEdge).toEqual({ x: 100, y: 68, width: 6, height: 464 });
    expect(f.cornerB).toEqual({ x: 100, y: 532, width: 18, height: 18 });
    expect(gripFrames("left", { x: 0, y: 0, width: 400, height: 500 }).farEdge.x).toBe(394);
    expect(gripFrames("top", { x: 0, y: 0, width: 500, height: 400 }).farEdge.y).toBe(394);
  });
});
