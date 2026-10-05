import { addDays, startOfDay } from "../capture/snooze";
import type { DueItem } from "./dueItem";
import { dayString } from "./pinSummary";

export interface ReminderSettings {
  /** Hour (0-23) a date-only task is notified at. */
  dateOnlyHour: number;
  morningSummaryEnabled: boolean;
  /** Minutes after midnight the morning summary fires at. */
  morningSummaryMinutes: number;
}

export function reminderSettings(p: Partial<ReminderSettings> = {}): ReminderSettings {
  return {
    dateOnlyHour: Math.min(Math.max(p.dateOnlyHour ?? 9, 0), 23),
    morningSummaryEnabled: p.morningSummaryEnabled ?? false,
    morningSummaryMinutes: Math.min(Math.max(p.morningSummaryMinutes ?? 8 * 60, 0), 24 * 60 - 1),
  };
}

/** One local notification the app wants pending. */
export interface ReminderRequest {
  identifier: string;
  kind: "item" | "summary";
  title: string;
  body: string;
  fireDate: Date;
  pinId?: string;
  itemId?: string;
}

/** The platform has no hard limit on Windows; the cap keeps behavior and tests identical to the Mac. */
export const maxPending = 64;
export const itemPrefix = "brink.reminder.item.";
export const summaryPrefix = "brink.reminder.summary.";
export const snoozePrefix = "brink.snooze.";
/** Morning summaries planned ahead (today if still upcoming, then the next days). */
export const summaryDaysAhead = 3;
export const snoozeSeconds = 3600;

function at(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0);
}

export function fireDate(item: DueItem, hour: number): Date {
  return item.hasTime ? item.due : at(startOfDay(item.due), hour, 0);
}

export function timeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "<pin title> · Due at <time>" or "<pin title> · Due today" (U+00B7). */
export function itemBody(item: DueItem, pinTitle: string | undefined): string {
  const when = item.hasTime ? `Due at ${timeLabel(item.due)}` : "Due today";
  return [pinTitle, when].filter((x) => x !== undefined).join(" · ");
}

function summaries(items: DueItem[], now: Date, minutes: number): ReminderRequest[] {
  const out: ReminderRequest[] = [];
  const today = startOfDay(now);
  for (let offset = 0; offset < summaryDaysAhead; offset++) {
    const day = addDays(today, offset);
    const fire = at(day, Math.floor(minutes / 60), minutes % 60);
    if (fire <= now) continue;
    const nextDay = addDays(day, 1);
    const dueThatDay = items.filter((i) => i.due >= day && i.due < nextDay).length;
    const overdue = items.filter((i) => i.due < day).length;
    if (dueThatDay + overdue === 0) continue;
    let body = dueThatDay === 1 ? "1 task due today" : `${dueThatDay} tasks due today`;
    if (dueThatDay === 0) body = `${overdue} overdue`;
    else if (overdue > 0) body += ` · ${overdue} overdue`;
    out.push({ identifier: summaryPrefix + dayString(day), kind: "summary", title: "Brink", body, fireDate: fire });
  }
  return out;
}

/**
 * Turns due items into the notifications to schedule. Past fire times are skipped (they still count
 * as "overdue" in the morning summary). The result is sorted soonest first, then identifier, and cut to `limit`.
 */
export function planReminders(
  items: DueItem[],
  pinTitles: Record<string, string>,
  now: Date,
  settings: ReminderSettings,
  limit: number = maxPending,
): ReminderRequest[] {
  const requests: ReminderRequest[] = [];
  for (const item of items) {
    const fire = fireDate(item, settings.dateOnlyHour);
    if (fire <= now) continue;
    requests.push({
      identifier: `${itemPrefix}${item.pinId}.${item.id}`, kind: "item", title: item.title,
      body: itemBody(item, pinTitles[item.pinId]), fireDate: fire, pinId: item.pinId, itemId: item.id,
    });
  }
  if (settings.morningSummaryEnabled) requests.push(...summaries(items, now, settings.morningSummaryMinutes));
  requests.sort((a, b) =>
    a.fireDate.getTime() === b.fireDate.getTime()
      ? (a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0)
      : a.fireDate.getTime() - b.fireDate.getTime());
  return requests.slice(0, Math.max(limit, 0));
}
