import { describe, expect, it } from "vitest";
import { chipText, dateLabel, isOverdue, parseDate } from "./dates";

describe("date chip", () => {
  const now = new Date(2026, 9, 5, 12, 0);
  it("labels Today / Tomorrow / ddd d MMM", () => {
    expect(dateLabel(new Date(2026, 9, 5), now)).toBe("Today");
    expect(dateLabel(new Date(2026, 9, 6), now)).toBe("Tomorrow");
    expect(dateLabel(new Date(2026, 9, 9), now)).toBe("Fri 9 Oct");
  });
  it("appends the time only for date-times", () => {
    expect(chipText(new Date(2026, 9, 9), false, now)).toBe("Fri 9 Oct");
    expect(chipText(new Date(2026, 9, 9, 15, 30), true, now)).toMatch(/^Fri 9 Oct .*3:30/);
    expect(chipText(null, false, now)).toBe("Date");
  });
  it("is overdue only before today", () => {
    expect(isOverdue(new Date(2026, 9, 4, 23, 59), now)).toBe(true);
    expect(isOverdue(new Date(2026, 9, 5, 0, 0), now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });
  it("parses date-only as local midnight and date-time with offset", () => {
    const d = parseDate("2026-10-05");
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate(), d?.getHours()]).toEqual([2026, 9, 5, 0]);
    expect(parseDate("2026-10-05T10:00:00+02:00")?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(parseDate("2026-10-05T10:00:00.000+02:00")?.toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(parseDate("nope")).toBeNull();
  });
});
