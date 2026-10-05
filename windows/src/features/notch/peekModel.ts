import type { PinSummary } from "../../domain/store/pinSummary";

/** The card lists at most this many items (PeekTooltip.items). */
export const PEEK_ITEMS = 3;

/** "Loading…" before the first summary, "No tasks", "All done", else "N open". */
export function peekSubtitle(summary: PinSummary | null | undefined): string {
  if (!summary) return "Loading…";
  if (summary.total === 0) return "No tasks";
  return summary.openCount === 0 ? "All done" : `${summary.openCount} open`;
}

/** Items shown on the card; the card height follows `nextItems.count` like the Mac layout. */
export function peekItems(summary: PinSummary | null | undefined): { id: string; title: string }[] {
  return (summary?.nextRefs ?? []).slice(0, PEEK_ITEMS);
}

export function peekItemCount(summary: PinSummary | null | undefined): number {
  return Math.min(summary?.nextItems.length ?? 0, PEEK_ITEMS);
}
