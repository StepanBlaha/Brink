import type { NotchConfigParams } from "./params";
import type { PhaseMachine } from "./phaseMachine";

/**
 * Debug commands (screenshots, no real mouse): `resting`, `strip`, `expanded[:pinId]`, `add`,
 * `peek:pinId`, and `edge=left|right|top`, `size=small|medium|large`, `pill=...`, `outline=1`,
 * `reduce=1`. Delivered by `window.__notch(cmd)` and, in debug Rust builds, `notch://debug`.
 */
export function applyDebug(
  cmd: string,
  machine: PhaseMachine,
  setConfig: (c: Partial<NotchConfigParams>) => void,
  firstPinId: string,
): void {
  const c = cmd.trim();
  const eq = c.indexOf("=");
  if (eq > 0) {
    const k = c.slice(0, eq);
    const v = c.slice(eq + 1);
    if (k === "edge" && (v === "left" || v === "right" || v === "top")) setConfig({ edge: v });
    if (k === "size" && (v === "small" || v === "medium" || v === "large")) setConfig({ size: v });
    if (k === "pill" && (v === "line" || v === "percent" || v === "dot" || v === "hidden")) setConfig({ pill: v });
    if (k === "outline") setConfig({ outline: v === "1" });
    if (k === "reduce") setConfig({ reduce: v === "1" });
    return;
  }
  const [name, arg] = c.split(":");
  if (name === "resting") {
    machine.forceResting();
  } else if (name === "strip") {
    machine.forceStrip();
  } else if (name === "expanded") {
    machine.forceStrip();
    machine.selectPin(arg || firstPinId);
  } else if (name === "add") {
    machine.openAddFlow();
  } else if (name === "peek") {
    machine.forceStrip();
    machine.forcePeek(arg || firstPinId);
  }
}
