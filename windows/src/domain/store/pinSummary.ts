import type { Block } from "../notion/block";
import { blockPlainText } from "../notion/block";
import type { Row } from "../notion/row";
import type { DatabaseConfig } from "./pin";
import { progressCounts } from "./pillStyle";
import { parseDueDate, type DueItem } from "./dueItem";

export interface ItemRef {
  id: string;
  title: string;
}

/** Glanceable per-pin counts shown as badges, hover peeks and the live pill. */
export interface PinSummary {
  openCount: number;
  doneCount: number;
  total: number;
  dueTodayCount: number;
  /** Titles of the first (up to) three open items. */
  nextItems: string[];
  /** Ids and titles of the first (up to) `nextRefLimit` open items. */
  nextRefs: ItemRef[];
  /** Every open item that has a date (database pins with a date property only). */
  dueItems: DueItem[];
}

export const nextItemLimit = 3;
export const nextRefLimit = 7;

export const emptySummary = (): PinSummary => ({
  openCount: 0, doneCount: 0, total: 0, dueTodayCount: 0, nextItems: [], nextRefs: [], dueItems: [],
});

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** `YYYY-MM-DD` in the local zone (the format Notion date starts begin with). */
export function dayString(date: Date = new Date()): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Counts to-do blocks in a flat list (top level plus whatever children were loaded). */
export function summaryFromBlocks(blocks: Block[]): PinSummary {
  const s = emptySummary();
  for (const block of blocks) {
    if (block.type.kind !== "toDo") continue;
    s.total += 1;
    if (block.type.checked) {
      s.doneCount += 1;
      continue;
    }
    s.openCount += 1;
    const title = blockPlainText(block).trim();
    if (title !== "" && s.nextItems.length < nextItemLimit) s.nextItems.push(title);
    if (title !== "" && s.nextRefs.length < nextRefLimit) s.nextRefs.push({ id: block.id, title });
  }
  return s;
}

export function isRowDone(row: Row, config: DatabaseConfig): boolean {
  const v = row.properties[config.doneProperty];
  if (config.doneKind === "checkbox") return v?.type === "checkbox" && v.checkbox;
  return v?.type === "status" && v.status !== undefined && v.status.name === config.doneValue;
}

/**
 * Counts database rows using the pin's config: done = the done property (checkbox true, or status
 * equal to `doneValue`); due today = an open row whose date property starts today.
 */
export function summaryFromRows(rows: Row[], config: DatabaseConfig, today: string, pinId = ""): PinSummary {
  const s = emptySummary();
  for (const row of rows) {
    s.total += 1;
    if (isRowDone(row, config)) {
      s.doneCount += 1;
      continue;
    }
    s.openCount += 1;
    const trimmed = row.title.trim();
    const title = trimmed === "" ? "Untitled" : trimmed;
    if (s.nextItems.length < nextItemLimit) s.nextItems.push(title);
    if (s.nextRefs.length < nextRefLimit) s.nextRefs.push({ id: row.id, title });
    const v = config.dateProperty === undefined ? undefined : row.properties[config.dateProperty];
    const start = v?.type === "date" ? v.date?.start : undefined;
    if (start === undefined) continue;
    if (start.startsWith(today)) s.dueTodayCount += 1;
    const parsed = parseDueDate(start);
    if (parsed) s.dueItems.push({ id: row.id, pinId, title, due: parsed.date, hasTime: parsed.hasTime });
  }
  return s;
}

/** done/total summed over the given summaries; `null` when there is nothing to measure. */
export function progressRatio(summaries: PinSummary[]): number | null {
  const c = progressCounts(summaries);
  return c ? c.done / c.total : null;
}
