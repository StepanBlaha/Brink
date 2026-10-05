import type { NotchEdge } from "../features/notch/notchGeometry";

export const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

/** SwiftUI spring(response, dampingFraction), mass 1, as Motion spring options. */
export function springFor(response: number, dampingFraction: number) {
  return {
    type: "spring" as const,
    stiffness: ((2 * Math.PI) / response) ** 2,
    damping: (4 * Math.PI * dampingFraction) / response,
    mass: 1,
  };
}

/** Theme.Motion. */
export const unfold = springFor(0.62, 0.72);
export const contents = springFor(0.48, 0.8);
export const list = springFor(0.42, 0.82);
export const crossfade = { duration: 0.16, ease: "easeInOut" as const };
/** Reduce Motion: springs collapse to an instant linear transition. */
export const instant = { duration: 0.001, ease: "linear" as const };

export const phaseOffset = 14;

export function edgeOffset(edge: NotchEdge): { x: number; y: number } {
  if (edge === "right") return { x: phaseOffset, y: 0 };
  if (edge === "left") return { x: -phaseOffset, y: 0 };
  return { x: 0, y: -phaseOffset };
}

/** Stagger delay in seconds for strip icon `i`, capped at 0.18. */
export function stagger(i: number, reduce: boolean): number {
  return reduce ? 0 : Math.min(i * 0.045, 0.18);
}
