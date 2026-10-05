import { describe, expect, it } from "vitest";
import { emptySummary, type PinSummary } from "../../domain/store/pinSummary";
import { badgeCount, pillView } from "./pillModel";
import { peekItemCount, peekItems, peekSubtitle } from "./peekModel";

const s = (o: Partial<PinSummary>): PinSummary => ({ ...emptySummary(), ...o });
const sums: Record<string, PinSummary> = {
  a: s({ total: 8, doneCount: 3, openCount: 5, dueTodayCount: 2 }),
  b: s({ total: 4, doneCount: 4 }),
};
const base = { mode: "activeGroup" as const, stripIds: ["a", "b", "none"], lastOpenedPinID: undefined, asFraction: true, summaryFor: (id: string) => sums[id] };

describe("pill", () => {
  it("fraction 7/12 and percent 58%", () => {
    expect(pillView(base)).toEqual({ ratio: 7 / 12, label: "7/12" });
    expect(pillView({ ...base, asFraction: false }).label).toBe("58%");
  });
  it("lastPin measures only the last opened pin", () => {
    expect(pillView({ ...base, mode: "lastPin", lastOpenedPinID: "b" })).toEqual({ ratio: 1, label: "4/4" });
    expect(pillView({ ...base, mode: "lastPin" }).label).toBe("–");
  });
  it("off hides the bar but keeps the label; nothing to measure shows a dash", () => {
    expect(pillView({ ...base, mode: "off" })).toEqual({ ratio: null, label: "7/12" });
    expect(pillView({ ...base, stripIds: [] })).toEqual({ ratio: null, label: "–" });
  });
});

describe("badges", () => {
  it("open, due today, off, no summary", () => {
    expect(badgeCount(sums["a"], "open")).toBe(5);
    expect(badgeCount(sums["a"], "dueToday")).toBe(2);
    expect(badgeCount(sums["a"], "off")).toBe(0);
    expect(badgeCount(undefined, "open")).toBe(0);
  });
});

describe("peek model", () => {
  it("subtitles", () => {
    expect(peekSubtitle(undefined)).toBe("Loading…");
    expect(peekSubtitle(s({}))).toBe("No tasks");
    expect(peekSubtitle(s({ total: 2, doneCount: 2 }))).toBe("All done");
    expect(peekSubtitle(s({ total: 3, openCount: 2 }))).toBe("2 open");
  });
  it("at most three items; the card height follows nextItems", () => {
    const refs = ["a", "b", "c", "d"].map((id) => ({ id, title: id }));
    const sm = s({ total: 4, openCount: 4, nextRefs: refs, nextItems: ["a", "b", "c"] });
    expect(peekItems(sm)).toHaveLength(3);
    expect(peekItemCount(sm)).toBe(3);
    expect(peekItemCount(undefined)).toBe(0);
  });
});
