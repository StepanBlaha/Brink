import type { Transition } from "motion/react";

/** Brand springs (see branding/BRAND.md). response 0.62 / damping 0.72 => k=100, c=14.4. */
export const notchSpring: Transition = { type: "spring", stiffness: 100, damping: 14.4 };
/** Contents spring: response 0.48 / damping 0.8. */
export const contentSpring: Transition = { type: "spring", stiffness: 171, damping: 20.9 };
export const softSpring: Transition = { type: "spring", stiffness: 180, damping: 22, mass: 0.9 };
export const easeOut = [0.2, 0.8, 0.2, 1] as const;
export const instant: Transition = { duration: 0 };

/** 45 ms per item, capped at 180 ms. */
export function stagger(index: number): number {
  return Math.min(index * 0.045, 0.18);
}
