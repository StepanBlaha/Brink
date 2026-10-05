import { announcement } from "./announce";
import type { PhaseState } from "./phaseMachine";

const hidden = {
  position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
} as const;

/** Polite live region for the notch phases (Narrator and NVDA). Visually hidden. */
export function NotchAnnouncer({ state, titleOf }: { state: PhaseState; titleOf: (id: string) => string | undefined }) {
  return (
    <div role="status" aria-live="polite" aria-atomic style={hidden}>
      {announcement(state, titleOf)}
    </div>
  );
}
