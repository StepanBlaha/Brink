import { create } from "zustand";
import type { PinSummary } from "../domain/store/pinSummary";

interface SummaryState {
  summaries: Record<string, PinSummary>;
  set: (pinId: string, summary: PinSummary) => void;
  /** Drops summaries of pins that are gone. */
  prune: (keep: Set<string>) => void;
  /** Replaces everything (demo and tests). */
  replace: (summaries: Record<string, PinSummary>) => void;
}

/** Per-pin glanceable counts (badges, peeks, pill, Today). Written by the hub's `PinSummaryService`. */
export const useSummaryStore = create<SummaryState>((set) => ({
  summaries: {},
  set: (pinId, summary) => set((s) => ({ summaries: { ...s.summaries, [pinId]: summary } })),
  prune: (keep) => set((s) => ({ summaries: Object.fromEntries(Object.entries(s.summaries).filter(([k]) => keep.has(k))) })),
  replace: (summaries) => set({ summaries }),
}));
