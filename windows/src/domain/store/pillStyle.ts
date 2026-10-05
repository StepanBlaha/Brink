export const pillStyles = ["hidden", "dot", "line", "percent"] as const;
export type PillStyle = (typeof pillStyles)[number];

export const pillStyleNames: Record<PillStyle, string> = { hidden: "Hidden", dot: "Dot", line: "Line", percent: "Percent" };

/** A stored style wins; otherwise a legacy `restingPillHidden: true` means hidden, anything else line. */
export function resolvePillStyle(stored: string | undefined, legacyHidden: boolean | undefined): PillStyle {
  if (stored !== undefined && (pillStyles as readonly string[]).includes(stored)) return stored as PillStyle;
  return legacyHidden === true ? "hidden" : "line";
}

/** "7/12" (fraction) or "58%". */
export function pillLabel(done: number, total: number, asFraction: boolean): string {
  if (total <= 0) return asFraction ? "0/0" : "0%";
  if (asFraction) return `${done}/${total}`;
  return `${Math.round((done / total) * 100)}%`;
}

/** Summed (done, total) across summaries; `undefined` when there are no to-dos at all. */
export function progressCounts(summaries: { total: number; doneCount: number }[]): { done: number; total: number } | undefined {
  const total = summaries.reduce((a, s) => a + s.total, 0);
  if (total <= 0) return undefined;
  return { done: summaries.reduce((a, s) => a + s.doneCount, 0), total };
}
