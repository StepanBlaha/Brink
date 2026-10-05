import { startOfDay } from "../../domain/capture/snooze";

/** `DatabaseViewModel.parseDate`: date-only = local midnight, date-time keeps its offset. */
export function parseDate(s: string): Date | null {
  if (s.includes("T")) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const sameDay = (a: Date, b: Date): boolean => startOfDay(a).getTime() === startOfDay(b).getTime();

/** Today / Tomorrow / `ddd d MMM` (the Mac `EEE d MMM`). */
export function dateLabel(d: Date, now: Date = new Date()): string {
  if (sameDay(d, now)) return "Today";
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (sameDay(d, tomorrow)) return "Tomorrow";
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function timeLabel(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Chip text: label plus the time when the stored value carries one. */
export function chipText(d: Date | null, hasTime: boolean, now: Date = new Date()): string {
  if (!d) return "Date";
  return hasTime ? `${dateLabel(d, now)} ${timeLabel(d)}` : dateLabel(d, now);
}

/** Red when before the start of today. */
export function isOverdue(d: Date | null, now: Date = new Date()): boolean {
  return d !== null && d.getTime() < startOfDay(now).getTime();
}
