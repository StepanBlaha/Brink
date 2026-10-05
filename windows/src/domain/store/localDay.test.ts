import { describe, expect, it } from "vitest";
import { parseDueDate } from "./dueItem";
import { dayString } from "./pinSummary";

describe("local calendar day", () => {
  it("dayString uses the local date late in the evening and just after midnight", () => {
    expect(dayString(new Date(2026, 8, 28, 23, 59, 59))).toBe("2026-09-28");
    expect(dayString(new Date(2026, 8, 28, 0, 0, 1))).toBe("2026-09-28");
  });

  it("date-only due strings are local midnight of that day", () => {
    const p = parseDueDate("2026-09-28");
    expect(p?.hasTime).toBe(false);
    expect(p?.date.getTime()).toBe(new Date(2026, 8, 28).getTime());
    expect(dayString(p!.date)).toBe("2026-09-28");
  });
});
