import { describe, expect, it } from "vitest";
import { edgeNotchPath, type NotchParams } from "./edgeNotchPath";
import { boundingRect } from "./notchGeometry";

/** Endpoints of every command (arcs are axis-aligned quarter circles, so these bound the shape). */
function points(path: string): [number, number][] {
  const out: [number, number][] = [];
  for (const seg of path.split(/(?=[MLAZ])/)) {
    const n = seg.slice(1).trim().split(/\s+/).map(Number);
    if (seg[0] === "M" || seg[0] === "L") out.push([n[0] ?? 0, n[1] ?? 0]);
    if (seg[0] === "A") out.push([n[5] ?? 0, n[6] ?? 0]);
  }
  return out;
}

function bbox(path: string) {
  const pts = points(path);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

const side: NotchParams = { depth: 40, length: 200, corner: 10, flare: 10, center: 250 };
const W = 1000;
const H = 500;

describe("edgeNotchPath", () => {
  it("left is the right path mirrored point by point", () => {
    const r = points(edgeNotchPath(W, H, "right", side));
    const l = points(edgeNotchPath(W, H, "left", side));
    expect(l.length).toBe(r.length);
    r.forEach(([x, y], i) => {
      expect(l[i]?.[0]).toBeCloseTo(W - x, 3);
      expect(l[i]?.[1]).toBeCloseTo(y, 3);
    });
  });

  it("mirroring flips the arc sweep flags", () => {
    const sweeps = (p: string) => [...p.matchAll(/A [\d.]+ [\d.]+ 0 0 (\d)/g)].map((m) => m[1]);
    expect(sweeps(edgeNotchPath(W, H, "right", side))).toEqual(["1", "0", "0", "1"]);
    expect(sweeps(edgeNotchPath(W, H, "left", side))).toEqual(["0", "1", "1", "0"]);
    expect(sweeps(edgeNotchPath(W, H, "top", side))).toEqual(["1", "0", "0", "1"]);
  });

  it.each(["left", "right", "top"] as const)("bounding box equals NotchGeometry.boundingRect (%s)", (edge) => {
    const center = edge === "top" ? 500 : 250;
    const p = { ...side, center };
    const box = bbox(edgeNotchPath(W, H, edge, p));
    const want = boundingRect(edge, { width: W, height: H }, 40, 200, 10, center);
    expect(box.x).toBeCloseTo(want.x, 3);
    expect(box.y).toBeCloseTo(want.y, 3);
    expect(box.width).toBeCloseTo(want.width, 3);
    expect(box.height).toBeCloseTo(want.height, 3);
  });

  it("clamps corner and flare for tiny shapes without NaN", () => {
    const p = edgeNotchPath(W, H, "right", { depth: 0, length: 0, corner: 22, flare: 20, center: 100 });
    expect(p).not.toContain("NaN");
  });

  it("snapshots resting, strip and expanded on every edge", () => {
    const resting: NotchParams = { depth: 8, length: 80, corner: 4, flare: 6, center: 400 };
    const strip: NotchParams = { depth: 56, length: 270, corner: 18, flare: 14, center: 400 };
    const open: NotchParams = { depth: 400, length: 560, corner: 22, flare: 20, center: 400 };
    const all = (["right", "left", "top"] as const).flatMap((e) =>
      [resting, strip, open].map((p) => edgeNotchPath(900, 800, e, p)),
    );
    expect(all).toMatchSnapshot();
  });
});
