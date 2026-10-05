import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isoString, snoozeTarget } from "./snooze";

// NaturalDateTests.snooze: now = 2026-09-29 10:00 Europe/Prague.
describe("snooze", () => {
  const prevTz = process.env["TZ"];
  beforeAll(() => {
    process.env["TZ"] = "Europe/Prague";
  });
  afterAll(() => {
    if (prevTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = prevTz;
  });
  const now = () => new Date(2026, 8, 29, 10, 0);
  const f = (t: { date: Date; hasTime: boolean }) => isoString(t.date, t.hasTime);

  it("snooze targets", () => {
    const evening = new Date(2026, 8, 29, 18, 30);
    expect(f(snoozeTarget("laterToday", evening, true, now()))).toBe("2026-09-29T13:00:00+02:00");
    expect(f(snoozeTarget("tomorrow", null, false, now()))).toBe("2026-09-30");
    expect(f(snoozeTarget("tomorrow", evening, true, now()))).toBe("2026-09-30T18:30:00+02:00");
    expect(f(snoozeTarget("nextWeek", evening, false, now()))).toBe("2026-10-05");
  });

  it("next week from a Monday goes a full week", () => {
    expect(f(snoozeTarget("nextWeek", null, false, new Date(2026, 9, 5, 9, 0)))).toBe("2026-10-12");
  });
});
