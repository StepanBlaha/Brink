import type { NotchEdge } from "./notchGeometry";

export type Edge = NotchEdge;
export interface NotchParams {
  depth: number;
  length: number;
  corner: number;
  flare: number;
  center: number;
}

/**
 * SVG path of the notch shape. Port of EdgeNotchShape.path(in:). Traced as if on the right
 * edge, then mirrored (left) or rotated (top). Concave tangent-arc flares, convex far corners.
 */
export function edgeNotchPath(w: number, h: number, edge: Edge, p: NotchParams): string {
  const vw = edge === "top" ? h : w;
  const half = Math.max(p.length, 0) / 2;
  const T = p.center - half;
  const B = p.center + half;
  const cr = Math.max(0, Math.min(p.corner, Math.min(Math.max(p.depth, 0), half)));
  const fl = Math.max(0, Math.min(p.flare, half));
  const d = Math.max(p.depth, cr);
  const E = vw;
  const F = Math.max(0, E - d);
  const f = Math.min(fl, Math.max(0, d - cr));
  const map = (x: number, y: number): [number, number] =>
    edge === "right" ? [x, y] : edge === "left" ? [vw - x, y] : [y, vw - x];
  const P = (x: number, y: number): string =>
    map(x, y)
      .map((n) => +n.toFixed(3))
      .join(" ");
  const sweep = (s: 0 | 1): 0 | 1 => (edge === "left" ? ((1 - s) as 0 | 1) : s);
  return [
    `M ${P(E, T - f)}`,
    `A ${f} ${f} 0 0 ${sweep(1)} ${P(E - f, T)}`,
    `L ${P(F + cr, T)}`,
    `A ${cr} ${cr} 0 0 ${sweep(0)} ${P(F, T + cr)}`,
    `L ${P(F, B - cr)}`,
    `A ${cr} ${cr} 0 0 ${sweep(0)} ${P(F + cr, B)}`,
    `L ${P(E - f, B)}`,
    `A ${f} ${f} 0 0 ${sweep(1)} ${P(E, B + f)}`,
    "Z",
  ].join(" ");
}
