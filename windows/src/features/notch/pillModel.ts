import type { PillProgressMode } from "../../ipc/types";
import { pillLabel, progressCounts } from "../../domain/store/pillStyle";
import type { PinSummary } from "../../domain/store/pinSummary";
import type { BadgeMode } from "../../ipc/types";

export interface PillInput {
  mode: PillProgressMode;
  /** Ids of the strip items (the active group, plus Today when shown). */
  stripIds: string[];
  lastOpenedPinID: string | undefined;
  asFraction: boolean;
  summaryFor: (pinId: string) => PinSummary | undefined;
}

/** Pins the pill's progress and label measure: the last opened pin, or (default) the strip's active group. */
export function pillSummaries(i: Pick<PillInput, "mode" | "stripIds" | "lastOpenedPinID" | "summaryFor">): PinSummary[] {
  if (i.mode === "lastPin") {
    const s = i.lastOpenedPinID ? i.summaryFor(i.lastOpenedPinID) : undefined;
    return s ? [s] : [];
  }
  return i.stripIds.flatMap((id) => i.summaryFor(id) ?? []);
}

/** Fill ratio (null = no bar) and label text of the resting pill. */
export function pillView(i: PillInput): { ratio: number | null; label: string } {
  const c = progressCounts(pillSummaries(i));
  const ratio = i.mode !== "off" && c ? c.done / c.total : null;
  return { ratio, label: c ? pillLabel(c.done, c.total, i.asFraction) : "–" };
}

/** What the strip count badge shows for a pin. */
export function badgeCount(summary: PinSummary | undefined, mode: BadgeMode): number {
  if (!summary) return 0;
  switch (mode) {
    case "off":
      return 0;
    case "open":
      return summary.openCount;
    case "dueToday":
      return summary.dueTodayCount;
  }
}
