import { nextOccurrence } from "./snooze";
import { addDays, startOfDay } from "./snooze";
import { alternation, months, units, weekdays } from "./naturalDateVocabulary";

export interface Hit {
  start: number;
  end: number;
  date: Date;
  hasTime: boolean;
}

export interface Context {
  now: Date;
  startOfToday: Date;
}

export function makeContext(now: Date): Context {
  return { now, startOfToday: startOfDay(now) };
}

type Pattern = { rx: RegExp; build: (m: RegExpExecArray, c: Context) => Hit | null };

const B = String.raw`(?<![\p{L}\p{N}])`;
const E = String.raw`(?![\p{L}\p{N}])`;
const LEAD = String.raw`(?:(?<![\p{L}\p{N}])(?:on|at|by|v|ve|do|na)\s+)?`;
const NEXT_WORD = String.raw`(?:(?<![\p{L}\p{N}])(?:next|příští|pristi|this|tento|tuto|tuhle)\s+)?`;
const rx = (src: string): RegExp => new RegExp(src, "giu");

function hit(m: RegExpExecArray, date: Date, hasTime = false): Hit {
  return { start: m.index, end: m.index + m[0].length, date, hasTime };
}

/** Builds a local date; null when the day overflows; a past day without a year rolls to next year. */
function make(c: Context, year: number | undefined, month: number, day: number): Date | null {
  if (month < 1 || month > 12) return null;
  const y = year ?? c.now.getFullYear();
  const d = new Date(y, month - 1, day);
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null;
  if (year === undefined && d < c.startOfToday) return new Date(y + 1, month - 1, day);
  return d;
}

const num = (s: string | undefined): number | undefined => (s === undefined ? undefined : parseInt(s, 10));

export function datePatterns(): Pattern[] {
  const mo = alternation(Object.keys(months));
  const wd = alternation(Object.keys(weekdays));
  const un = alternation(Object.keys(units));
  return [
    { rx: rx(`${LEAD}${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`), build: (m, c) => {
      const d = make(c, num(m[1]), num(m[2])!, num(m[3])!);
      return d && hit(m, d);
    } },
    { rx: rx(`${LEAD}${B}(\\d{1,2})\\s*\\.\\s*(\\d{1,2})\\s*\\.(?:\\s*(\\d{4}))?(?!\\d)`), build: (m, c) => {
      const d = make(c, num(m[3]), num(m[2])!, num(m[1])!);
      return d && hit(m, d);
    } },
    { rx: rx(`${LEAD}${B}(${mo})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\d:])(?:,?\\s+(\\d{4})(?![\\d:]))?`), build: (m, c) => {
      const d = make(c, num(m[3]), months[m[1]!.toLowerCase()]!, num(m[2])!);
      return d && hit(m, d);
    } },
    { rx: rx(`${LEAD}${B}(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s*(?:of\\s+)?(${mo})${E}(?:,?\\s+(\\d{4})(?![\\d:]))?`), build: (m, c) => {
      const d = make(c, num(m[3]), months[m[2]!.toLowerCase()]!, num(m[1])!);
      return d && hit(m, d);
    } },
    { rx: rx(`${LEAD}${B}(day after tomorrow|pozítří|pozitri|tomorrow|tmrw|zítra|zitra|today|dnes|dneska|tonight)${E}`), build: (m, c) => {
      const w = m[1]!.toLowerCase();
      const offset = ["day after tomorrow", "pozítří", "pozitri"].includes(w) ? 2 : ["tomorrow", "tmrw", "zítra", "zitra"].includes(w) ? 1 : 0;
      return hit(m, addDays(c.startOfToday, offset));
    } },
    { rx: rx(`${B}(next week|příští týden|pristi tyden|příštím týdnu)${E}`), build: (m, c) =>
      hit(m, nextOccurrence(2, c.now)) },
    { rx: rx(`${B}(?:in|za)\\s+(?:(\\d+|an?)\\s+)?(${un})${E}`), build: (m, c) => {
      const n = m[1] === undefined ? 1 : /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1;
      const unit = units[m[2]!.toLowerCase()];
      if (!(n > 0 && n < 1000) || !unit) return null;
      if (unit === "hour") return hit(m, new Date(c.now.getTime() + n * 3600_000), true);
      const t = c.startOfToday;
      const d = unit === "day" ? addDays(t, n) : unit === "week" ? addDays(t, 7 * n) : new Date(t.getFullYear(), t.getMonth() + n, t.getDate());
      return hit(m, d);
    } },
    { rx: rx(`${LEAD}${NEXT_WORD}${B}(${wd})${E}`), build: (m, c) => {
      const w = weekdays[m[1]!.toLowerCase()];
      return w ? hit(m, nextOccurrence(w, c.now)) : null;
    } },
  ];
}

function timeHit(m: RegExpExecArray, h: number, min: number, c: Context): Hit {
  const d = new Date(c.startOfToday.getFullYear(), c.startOfToday.getMonth(), c.startOfToday.getDate(), h, min, 0);
  return hit(m, d, true);
}

export function timePatterns(): Pattern[] {
  const at = String.raw`(?:(?<![\p{L}\p{N}])(?:at|@|v|ve)\s+)?`;
  return [
    { rx: rx(`${at}${B}(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?m\\.?${E}`), build: (m, c) => {
      let h = parseInt(m[1]!, 10);
      if (h < 1 || h > 12) return null;
      const min = num(m[2]) ?? 0;
      if (min >= 60) return null;
      const pm = m[3]!.toLowerCase() === "p";
      if (h === 12) h = pm ? 12 : 0;
      else if (pm) h += 12;
      return timeHit(m, h, min, c);
    } },
    { rx: rx(`${at}${B}([01]?\\d|2[0-3]):([0-5]\\d)(?![\\p{N}:])`), build: (m, c) =>
      timeHit(m, parseInt(m[1]!, 10), parseInt(m[2]!, 10), c) },
  ];
}

export function firstHit(text: string, patterns: Pattern[], c: Context): Hit | null {
  for (const p of patterns) {
    p.rx.lastIndex = 0;
    for (const m of text.matchAll(p.rx)) {
      const h = p.build(m as RegExpExecArray, c);
      if (h) return h;
    }
  }
  return null;
}
