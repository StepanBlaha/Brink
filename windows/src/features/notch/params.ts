import type { NotchEdge } from "./notchGeometry";
import type { NotchSize, PillStyle } from "../../theme/notchMetrics";

/** M2 stand-ins for settings, overridable with query params for debugging and screenshots. */
export interface NotchConfigParams {
  edge: NotchEdge;
  size: NotchSize;
  pill: PillStyle;
  outline: boolean;
  pins: number;
  /** Debug start state: `strip`, `expanded`, `expanded:<pinId>`. */
  phase: string | null;
  reduce: boolean;
  /** Browser dev: draw a fake desktop behind the notch. */
  backdrop: boolean;
}

const pick = <T extends string>(v: string | null, all: readonly T[], fallback: T): T =>
  all.find((a) => a === v) ?? fallback;

export function parseParams(search: string): NotchConfigParams {
  const q = new URLSearchParams(search);
  return {
    edge: pick(q.get("edge"), ["right", "left", "top"], "right"),
    size: pick(q.get("size"), ["small", "medium", "large"], "medium"),
    pill: pick(q.get("pill"), ["line", "percent", "dot", "hidden"], "line"),
    outline: q.get("outline") === "1",
    pins: Math.min(Math.max(Number(q.get("pins") ?? 5) || 5, 0), 5),
    phase: q.get("phase"),
    reduce: q.get("reduce") === "1",
    backdrop: q.get("backdrop") === "1",
  };
}
