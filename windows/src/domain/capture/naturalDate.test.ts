import { describe, expect, it } from "vitest";
import { isoString, nextOccurrence, parseNaturalDate } from "./naturalDate";
import { snoozeTarget } from "./snooze";

// Tuesday 2026-09-29 10:00 in Prague (vitest.config.ts pins TZ=Europe/Prague).
const now = new Date(2026, 8, 29, 10, 0);
const parse = (s: string) => parseNaturalDate(s, now);
const iso = (s: string): string | null => {
  const r = parse(s);
  return r.date ? isoString(r.date, r.hasTime) : null;
};

describe("NaturalDate", () => {
  it("runs in the Prague zone", () => {
    expect(isoString(new Date(2026, 8, 29, 10, 0), true)).toBe("2026-09-29T10:00:00+02:00");
  });

  const dates: [string, string, string][] = [
    ["Buy milk tomorrow", "Buy milk", "2026-09-30"],
    ["Buy milk today", "Buy milk", "2026-09-29"],
    ["tomorrow buy milk", "buy milk", "2026-09-30"],
    ["Call mom day after tomorrow", "Call mom", "2026-10-01"],
    ["Koupit mléko zítra", "Koupit mléko", "2026-09-30"],
    ["Koupit mléko zitra", "Koupit mléko", "2026-09-30"],
    ["Koupit mléko dnes", "Koupit mléko", "2026-09-29"],
    ["Zavolat pozítří", "Zavolat", "2026-10-01"],
    ["Report friday", "Report", "2026-10-02"],
    ["Report on Friday", "Report", "2026-10-02"],
    ["Report next monday", "Report", "2026-10-05"],
    ["Report tuesday", "Report", "2026-10-06"],
    ["Zavolat v pátek", "Zavolat", "2026-10-02"],
    ["Schůzka pondělí", "Schůzka", "2026-10-05"],
    ["Schůzka ve středu", "Schůzka", "2026-09-30"],
    ["Výlet neděli", "Výlet", "2026-10-04"],
    ["Plan next week", "Plan", "2026-10-05"],
    ["Plán příští týden", "Plán", "2026-10-05"],
    ["Pay rent in 3 days", "Pay rent", "2026-10-02"],
    ["Pay rent in 2 weeks", "Pay rent", "2026-10-13"],
    ["Zaplatit za 3 dny", "Zaplatit", "2026-10-02"],
    ["Zaplatit za týden", "Zaplatit", "2026-10-06"],
    ["Zaplatit za 5 dní", "Zaplatit", "2026-10-04"],
    ["Odevzdat 15.10.", "Odevzdat", "2026-10-15"],
    ["Odevzdat 15. 10. 2026", "Odevzdat", "2026-10-15"],
    ["Odevzdat 1.3.", "Odevzdat", "2027-03-01"],
    ["Odevzdat 15. října", "Odevzdat", "2026-10-15"],
    ["Submit Oct 15", "Submit", "2026-10-15"],
    ["Submit October 15th", "Submit", "2026-10-15"],
    ["Submit 15 Oct", "Submit", "2026-10-15"],
    ["Submit Jan 5", "Submit", "2027-01-05"],
    ["Submit Jan 5 2028", "Submit", "2028-01-05"],
    ["Submit 2026-11-02", "Submit", "2026-11-02"],
  ];
  it.each(dates)("date phrase %s", (input, title, expected) => {
    const r = parse(input);
    expect(r.cleanTitle).toBe(title);
    expect(iso(input)).toBe(expected);
    expect(r.hasTime).toBe(false);
  });

  const times: [string, string, string][] = [
    ["Meet tomorrow 5pm", "Meet", "2026-09-30T17:00:00+02:00"],
    ["Meet tomorrow at 5:30 PM", "Meet", "2026-09-30T17:30:00+02:00"],
    ["Meet friday 17:00", "Meet", "2026-10-02T17:00:00+02:00"],
    ["Schůzka zítra v 17:00", "Schůzka", "2026-09-30T17:00:00+02:00"],
    ["Lunch 12pm today", "Lunch", "2026-09-29T12:00:00+02:00"],
    ["Alarm 12am tomorrow", "Alarm", "2026-09-30T00:00:00+02:00"],
    ["Call 17:00", "Call", "2026-09-29T17:00:00+02:00"],
    ["Call 9am", "Call", "2026-09-30T09:00:00+02:00"],
    ["Stretch in 2 hours", "Stretch", "2026-09-29T12:00:00+02:00"],
    ["Protáhnout za hodinu", "Protáhnout", "2026-09-29T11:00:00+02:00"],
  ];
  it.each(times)("time phrase %s", (input, title, expected) => {
    const r = parse(input);
    expect(r.cleanTitle).toBe(title);
    expect(r.hasTime).toBe(true);
    expect(iso(input)).toBe(expected);
  });

  it.each(["Buy milk", "Read chapter 3", "Call Sat", "Fix bug #12", "Version 2.5 release", ""])(
    "text without a date is untouched: %j",
    (input) => {
      const r = parse(input);
      expect(r.date).toBeNull();
      expect(r.cleanTitle).toBe(input.trim());
    },
  );

  it("a phrase that is the whole text is kept as the title", () => {
    const r = parse("tomorrow");
    expect(r.date).toBeNull();
    expect(r.cleanTitle).toBe("tomorrow");
  });

  it("date in the middle is removed cleanly", () => {
    const r = parse("Call mom tomorrow about the trip");
    expect(r.cleanTitle).toBe("Call mom about the trip");
    expect(iso("Call mom tomorrow about the trip")).toBe("2026-09-30");
  });

  it("nextOccurrence is strictly after", () => {
    expect(isoString(nextOccurrence(3, now), false)).toBe("2026-10-06");
  });

  it("snooze targets", () => {
    const f = (r: { date: Date; hasTime: boolean }) => isoString(r.date, r.hasTime);
    const evening = new Date(2026, 8, 29, 18, 30);
    expect(f(snoozeTarget("laterToday", evening, true, now))).toBe("2026-09-29T13:00:00+02:00");
    expect(f(snoozeTarget("tomorrow", null, false, now))).toBe("2026-09-30");
    expect(f(snoozeTarget("tomorrow", evening, true, now))).toBe("2026-09-30T18:30:00+02:00");
    expect(f(snoozeTarget("nextWeek", evening, false, now))).toBe("2026-10-05");
  });
});
