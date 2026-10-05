/** Port of SnoozeCalculator and the date helpers of NaturalDate (isoString, nextOccurrence). Local time zone. */
export type SnoozeOption = "laterToday" | "tomorrow" | "nextWeek";

export interface SnoozeTarget {
  date: Date;
  hasTime: boolean;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds());
}

/** `weekday` follows Swift: 1 = Sunday ... 2 = Monday ... 7 = Saturday. Never returns today. */
export function nextOccurrence(weekday: number, after: Date): Date {
  const start = startOfDay(after);
  const current = start.getDay() + 1;
  let delta = (weekday - current + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(start, delta);
}

function offsetString(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Notion date string: `yyyy-MM-dd`, or an offset date-time when `hasTime`. */
export function isoString(d: Date, hasTime: boolean): string {
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (!hasTime) return day;
  return `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offsetString(d)}`;
}

function applyTime(current: Date | null, hasTime: boolean, day: Date): SnoozeTarget {
  if (!hasTime || !current) return { date: day, hasTime: false };
  return {
    date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), current.getHours(), current.getMinutes(), 0),
    hasTime: true,
  };
}

/** Where a snoozed task's date lands. Tomorrow/next week keep an existing time of day. */
export function snoozeTarget(
  option: SnoozeOption,
  current: Date | null,
  currentHasTime: boolean,
  now: Date = new Date(),
): SnoozeTarget {
  switch (option) {
    case "laterToday":
      return { date: new Date(now.getTime() + 3 * 3600 * 1000), hasTime: true };
    case "tomorrow":
      return applyTime(current, currentHasTime, addDays(startOfDay(now), 1));
    case "nextWeek":
      return applyTime(current, currentHasTime, nextOccurrence(2, now));
  }
}
