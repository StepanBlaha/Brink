import type { PhaseState } from "./phaseMachine";

/** What a screen reader hears when the notch changes state. Titles are the pins' own names. */
export function announcement(s: PhaseState, titleOf: (id: string) => string | undefined): string {
  if (s.phase === "expanded") {
    const title = s.selectedPinId ? titleOf(s.selectedPinId) : undefined;
    if (s.addFlow) return "Brink, add a page";
    return title ? `Brink, ${title} open` : "Brink, panel open";
  }
  if (s.peekPinId) {
    const title = titleOf(s.peekPinId);
    return title ? `Brink, preview of ${title}` : "Brink, preview";
  }
  if (s.phase === "strip") return "Brink, pinned pages shown";
  return "Brink, collapsed";
}
