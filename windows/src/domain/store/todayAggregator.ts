import { startOfDay, addDays } from "../capture/snooze";
import type { Pin } from "./pin";
import { emptySummary, nextItemLimit, nextRefLimit, type PinSummary } from "./pinSummary";

export interface TodayItem {
  id: string;
  pinId: string;
  title: string;
  due: Date;
  hasTime: boolean;
  isOverdue: boolean;
}

export interface TodaySection {
  pinId: string;
  pinTitle: string;
  items: TodayItem[];
}

export interface TodayDigest {
  sections: TodaySection[];
}

export const digestItems = (d: TodayDigest): TodayItem[] => d.sections.flatMap((s) => s.items);
export const digestOpenCount = (d: TodayDigest): number => d.sections.reduce((n, s) => n + s.items.length, 0);
export const digestOverdueCount = (d: TodayDigest): number =>
  d.sections.reduce((n, s) => n + s.items.filter((i) => i.isOverdue).length, 0);
export const digestIsEmpty = (d: TodayDigest): boolean => d.sections.length === 0;

/** Only database pins with a date property take part (page to-dos have no dates). */
export const isEligible = (pin: Pin): boolean => pin.kind === "dataSource" && pin.config?.dateProperty !== undefined;

const titleCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: "accent" });

/**
 * Every open item due today or earlier, grouped by database pin. Sections follow the order of
 * `pins`; empty ones are dropped. Items sort by due date (overdue first), then title.
 * Overdue: a timed item whose time has passed, or a date-only item from an earlier day.
 */
export function aggregateToday(pins: Pin[], summaries: Record<string, PinSummary | undefined>, now: Date): TodayDigest {
  const startOfToday = startOfDay(now);
  const startOfTomorrow = addDays(startOfToday, 1);
  const sections: TodaySection[] = [];
  for (const pin of pins) {
    if (!isEligible(pin)) continue;
    const due = summaries[pin.id]?.dueItems;
    if (!due) continue;
    const items = due
      .filter((i) => i.due < startOfTomorrow)
      .sort((a, b) => (a.due.getTime() === b.due.getTime() ? titleCompare(a.title, b.title) : a.due.getTime() - b.due.getTime()))
      .map((i): TodayItem => ({
        id: i.id, pinId: pin.id, title: i.title, due: i.due, hasTime: i.hasTime,
        isOverdue: i.hasTime ? i.due < now : i.due < startOfToday,
      }));
    if (items.length > 0) sections.push({ pinId: pin.id, pinTitle: pin.title, items });
  }
  return { sections };
}

/** The Today pin's badge and hover peek: open = due today or overdue (PinSummaryService.todaySummary). */
export function todaySummary(digest: TodayDigest): PinSummary {
  const items = digestItems(digest);
  return {
    ...emptySummary(),
    openCount: items.length,
    total: items.length,
    dueTodayCount: items.length,
    nextItems: items.slice(0, nextItemLimit).map((i) => i.title),
    nextRefs: items.slice(0, nextRefLimit).map((i) => ({ id: i.id, title: i.title })),
  };
}
