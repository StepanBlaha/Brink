import { useEffect, useRef } from "react";
import { useSpring, useTransform, type MotionValue } from "motion/react";
import { unfold } from "../../theme/motion";
import { edgeNotchPath } from "./edgeNotchPath";
import { centerFor, metricsFor, type NotchLayout } from "./notchLayout";
import type { NotchPhase } from "./phaseMachine";

/**
 * One spring per shape parameter (depth, length, corner, flare, center) with the `unfold`
 * config, like the five `animatableData` values of EdgeNotchShape. A change of the window rect
 * (edge, size, placement) or Reduce Motion jumps instead of animating.
 */
export function useNotchPath(
  layout: NotchLayout,
  phase: NotchPhase,
  reduce: boolean,
): { path: MotionValue<string>; clip: MotionValue<string> } {
  const m = metricsFor(layout, phase);
  const center = centerFor(layout, phase, m);
  const depth = useSpring(m.depth, unfold);
  const length = useSpring(m.length, unfold);
  const corner = useSpring(m.corner, unfold);
  const flare = useSpring(m.flare, unfold);
  const ctr = useSpring(center, unfold);

  const frame = `${layout.edge}|${layout.windowSize.width}|${layout.windowSize.height}`;
  const lastFrame = useRef(frame);
  useEffect(() => {
    const jump = reduce || lastFrame.current !== frame;
    lastFrame.current = frame;
    const pairs: [MotionValue<number>, number][] = [
      [depth, m.depth],
      [length, m.length],
      [corner, m.corner],
      [flare, m.flare],
      [ctr, center],
    ];
    for (const [v, t] of pairs) {
      if (jump) v.jump(t);
      else v.set(t);
    }
  }, [frame, reduce, m.depth, m.length, m.corner, m.flare, center, depth, length, corner, flare, ctr]);

  const { edge, windowSize } = layout;
  const path = useTransform([depth, length, corner, flare, ctr], (v) => {
    const [d, l, c, f, mid] = v as number[];
    return edgeNotchPath(windowSize.width, windowSize.height, edge, {
      depth: d ?? 0,
      length: l ?? 0,
      corner: c ?? 0,
      flare: f ?? 0,
      center: mid ?? 0,
    });
  });
  const clip = useTransform(path, (p) => `path("${p}")`);
  return { path, clip };
}
