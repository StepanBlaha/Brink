import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodayDigest, TodayItem } from "../../domain/store/todayAggregator";
import { TICKED_LINGER_MS, TodayModel, todayDateLabel, type TodayPorts } from "./todayModel";

const NOW = new Date(2026, 8, 30, 12, 0);
const item = (id: string, over: Partial<TodayItem> = {}): TodayItem => ({
  id, pinId: "p1", title: id, due: new Date(2026, 8, 30), hasTime: false, isOverdue: false, ...over,
});

function make(ok = true) {
  const digest: TodayDigest = { sections: [{ pinId: "p1", pinTitle: "Sprint", items: [item("a"), item("b")] }] };
  const calls = { ticks: 0, done: [] as string[], snoozed: [] as string[] };
  const ports: TodayPorts = {
    digest: () => digest, tick: () => void (calls.ticks += 1),
    markDone: async (_p, i) => (calls.done.push(i), ok), snooze: async (i, o) => (calls.snoozed.push(`${i.id}:${o}`), ok),
  };
  return { m: new TodayModel(ports), calls, digest };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TodayModel", () => {
  it("a tick strikes the row, plays the tick, and removes it after 450 ms", async () => {
    const { m, calls } = make();
    const a = item("a");
    m.toggleDone(a);
    expect(calls.ticks).toBe(1);
    expect(m.isChecked("a")).toBe(true);
    expect(m.openCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(TICKED_LINGER_MS - 1);
    expect(m.openCount()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(m.openCount()).toBe(1);
    expect(calls.done).toEqual(["a"]);
    m.toggleDone(a);
    expect(calls.ticks).toBe(1);
  });

  it("a failed write brings the row back", async () => {
    const { m } = make(false);
    m.toggleDone(item("a"));
    await vi.advanceTimersByTimeAsync(TICKED_LINGER_MS + 10);
    expect(m.isChecked("a")).toBe(false);
    expect(m.openCount()).toBe(2);
  });

  it("snooze removes the row at once; later today keeps it", async () => {
    const { m, calls } = make();
    m.snooze(item("a"), "tomorrow");
    expect(m.openCount()).toBe(1);
    m.snooze(item("b"), "laterToday");
    expect(m.openCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.snoozed).toEqual(["a:tomorrow", "b:laterToday"]);
  });

  it("a failed snooze brings the row back", async () => {
    const { m } = make(false);
    m.snooze(item("a"), "nextWeek");
    await vi.advanceTimersByTimeAsync(0);
    expect(m.openCount()).toBe(2);
  });

  it("prune forgets ids the summaries dropped", () => {
    const { m, digest } = make();
    m.snooze(item("a"), "tomorrow");
    digest.sections[0]!.items = [item("b")];
    m.prune();
    digest.sections[0]!.items = [item("a"), item("b")];
    expect(m.openCount()).toBe(2);
  });
});

describe("todayDateLabel", () => {
  const d = (day: number, h?: number, min = 0): Date => (h === undefined ? new Date(2026, 8, day) : new Date(2026, 8, day, h, min));
  it("matches TodayRow.dateLabel", () => {
    expect(todayDateLabel(d(30), false, NOW)).toBe("Today");
    expect(todayDateLabel(d(30, 15, 30), true, NOW)).toMatch(/^3:30\s?PM$|^15:30$/);
    expect(todayDateLabel(d(29), false, NOW)).toBe("Yesterday");
    expect(todayDateLabel(d(28), false, NOW)).toBe("Mon 28 Sep");
    expect(todayDateLabel(d(28, 9), true, NOW)).toMatch(/^Mon 28 Sep (9:00\s?AM|09:00)$/);
  });
});
