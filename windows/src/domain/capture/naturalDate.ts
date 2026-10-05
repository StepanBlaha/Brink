import { firstHit, datePatterns, makeContext, timePatterns } from "./naturalDatePatterns";
import { addDays } from "./snooze";

export { isoString, nextOccurrence } from "./snooze";

export interface NaturalDateResult {
  cleanTitle: string;
  date: Date | null;
  hasTime: boolean;
}

function clean(s: string): string {
  const collapsed = s.split(/\s+/).filter(Boolean).join(" ");
  return collapsed.replace(/^[\s,;:\-\u2013\u2014]+|[\s,;:\-\u2013\u2014]+$/g, "");
}

/**
 * Parses (and strips) English/Czech date phrases: "buy milk tomorrow 5pm", "zavolat v pátek",
 * "report 15.10.", "in 3 days". Pure given `now`; local time zone. The macOS data-detector
 * fallback has no equivalent and is dropped (plan 9 item 21).
 */
export function parseNaturalDate(text: string, now: Date = new Date()): NaturalDateResult {
  const original = text.trim();
  const ctx = makeContext(now);
  const dateHit = firstHit(original, datePatterns(), ctx);
  let timeHit = firstHit(original, timePatterns(), ctx);
  if (dateHit && timeHit) {
    const overlap = Math.min(dateHit.end, timeHit.end) > Math.max(dateHit.start, timeHit.start);
    if (overlap || dateHit.hasTime) timeHit = null;
  }
  if (!dateHit && !timeHit) return { cleanTitle: original, date: null, hasTime: false };

  let result = dateHit ? dateHit.date : ctx.startOfToday;
  let hasTime = dateHit?.hasTime ?? false;
  if (timeHit) {
    result = new Date(result.getFullYear(), result.getMonth(), result.getDate(), timeHit.date.getHours(), timeHit.date.getMinutes(), 0);
    hasTime = true;
    if (!dateHit && result <= now) result = addDays(result, 1);
  }
  const ranges = [dateHit, timeHit].filter((h) => h !== null).sort((a, b) => b.start - a.start);
  let stripped = original;
  for (const r of ranges) stripped = stripped.slice(0, r.start) + " " + stripped.slice(r.end);
  const title = clean(stripped);
  if (title === "") return { cleanTitle: original, date: null, hasTime: false };
  return { cleanTitle: title, date: result, hasTime };
}
