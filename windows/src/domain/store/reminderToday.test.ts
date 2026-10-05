import { describe, expect, it } from "vitest";
import type { Row } from "../notion/row";
import type { PropertyValue } from "../notion/propertyValue";
import { parseDueDate, type DueItem } from "./dueItem";
import type { DatabaseConfig, Pin, PinKind } from "./pin";
import { pinIconNone } from "./pin";
import { emptySummary, summaryFromRows, type PinSummary } from "./pinSummary";
import { itemPrefix, planReminders, reminderSettings } from "./reminderPlanner";
import { aggregateToday, digestIsEmpty, digestItems, digestOpenCount, digestOverdueCount } from "./todayAggregator";

// TZ is pinned to Europe/Prague in vitest.config.ts.
const date = (y: number, m: number, d: number, h = 0, min = 0): Date => new Date(y, m - 1, d, h, min);
const item = (id: string, due: Date, o: { pin?: string; time?: boolean; title?: string } = {}): DueItem => ({
  id, pinId: o.pin ?? "p1", title: o.title ?? id, due, hasTime: o.time ?? false,
});
const now = date(2026, 9, 30, 12, 0);
const ids = (r: { itemId?: string }[]): (string | undefined)[] => r.map((x) => x.itemId);

describe("ReminderPlanner", () => {
  it("date-only items fire at the chosen hour, timed ones at their time", () => {
    const items = [item("a", date(2026, 10, 1)), item("b", date(2026, 10, 1, 15, 30), { time: true })];
    const plan = planReminders(items, {}, now, reminderSettings({ dateOnlyHour: 9 }));
    expect(ids(plan)).toEqual(["a", "b"]);
    expect(plan[0]?.fireDate).toEqual(date(2026, 10, 1, 9, 0));
    expect(plan[1]?.fireDate).toEqual(date(2026, 10, 1, 15, 30));
    expect(ids(planReminders(items, {}, now, reminderSettings({ dateOnlyHour: 18 })))).toEqual(["b", "a"]);
  });

  it("past fire times are skipped, including a date-only item whose hour has passed today", () => {
    const items = [
      item("old", date(2026, 9, 28)), item("todayMorning", date(2026, 9, 30)),
      item("todayEvening", date(2026, 9, 30), { title: "later" }),
      item("timedPast", date(2026, 9, 30, 8, 0), { time: true }), item("timedSoon", date(2026, 9, 30, 13, 0), { time: true }),
    ];
    expect(ids(planReminders(items, {}, now, reminderSettings({ dateOnlyHour: 9 })))).toEqual(["timedSoon"]);
    expect(ids(planReminders(items, {}, now, reminderSettings({ dateOnlyHour: 20 })))).toEqual(["timedSoon", "todayEvening", "todayMorning"]);
  });

  it("capped at 64, soonest first", () => {
    const base = date(2026, 10, 1, 8, 0).getTime();
    const items = Array.from({ length: 100 }, (_, i) => item(`i${i}`, new Date(base + (100 - i) * 60_000), { time: true }));
    const plan = planReminders(items, {}, now, reminderSettings());
    expect(plan).toHaveLength(64);
    expect(plan.map((r) => r.fireDate.getTime())).toEqual([...plan.map((r) => r.fireDate.getTime())].sort((a, b) => a - b));
    expect(plan[0]?.itemId).toBe("i99");
    expect(planReminders(items, {}, now, reminderSettings(), 5)).toHaveLength(5);
  });

  it("morning summary: counts today's tasks and overdue, skips a time that has passed", () => {
    const items = [item("a", date(2026, 9, 30)), item("b", date(2026, 9, 30)), item("c", date(2026, 9, 28)), item("d", date(2026, 10, 1))];
    const s = reminderSettings({ dateOnlyHour: 9, morningSummaryEnabled: true, morningSummaryMinutes: 8 * 60 + 30 });
    const sums = planReminders(items, {}, date(2026, 9, 30, 7, 0), s).filter((r) => r.kind === "summary");
    expect(sums).toHaveLength(3);
    expect(sums[0]?.fireDate).toEqual(date(2026, 9, 30, 8, 30));
    expect(sums[0]?.body).toBe("2 tasks due today · 1 overdue");
    expect(sums[1]?.body).toBe("1 task due today · 3 overdue");
    expect(sums[2]?.body).toBe("4 overdue");
    expect(sums[0]?.identifier).toBe("brink.reminder.summary.2026-09-30");
    const noon = planReminders(items, {}, now, s).filter((r) => r.kind === "summary");
    expect(noon).toHaveLength(2);
    expect(noon[0]?.fireDate).toEqual(date(2026, 10, 1, 8, 30));
    expect(planReminders(items, {}, now, reminderSettings({ morningSummaryEnabled: false })).every((r) => r.kind === "item")).toBe(true);
  });

  it("identifiers are stable and unique per pin and item", () => {
    const plan = planReminders([item("x", date(2026, 10, 2), { pin: "p1" }), item("x", date(2026, 10, 2), { pin: "p2" })], {}, now, reminderSettings());
    expect(new Set(plan.map((r) => r.identifier)).size).toBe(2);
    expect(plan.every((r) => r.identifier.startsWith(itemPrefix))).toBe(true);
  });

  it("body is '<pin> · Due today' or 'Due at <time>', and just the verdict without a pin title", () => {
    const plan = planReminders([item("a", date(2026, 10, 2)), item("b", date(2026, 10, 2, 15, 30), { time: true })], { p1: "Sprint" }, now, reminderSettings());
    expect(plan[0]?.body).toBe("Sprint · Due today");
    expect(plan[1]?.body).toMatch(/^Sprint · Due at .*30/);
    expect(planReminders([item("a", date(2026, 10, 2))], {}, now, reminderSettings())[0]?.body).toBe("Due today");
  });

  it("clamps settings", () => {
    expect(reminderSettings({ dateOnlyHour: 30, morningSummaryMinutes: -5 })).toMatchObject({ dateOnlyHour: 23, morningSummaryMinutes: 0 });
  });
});

describe("date parsing and summary due items", () => {
  it("date-only, offset time, fractional seconds, garbage", () => {
    const a = parseDueDate("2026-10-01");
    expect(a?.hasTime).toBe(false);
    expect(a?.date).toEqual(date(2026, 10, 1));
    const b = parseDueDate("2026-10-01T15:30:00.000+02:00");
    expect(b?.hasTime).toBe(true);
    expect(b?.date).toEqual(date(2026, 10, 1, 15, 30));
    expect(parseDueDate("2026-10-01T15:30:00+02:00")?.date).toEqual(date(2026, 10, 1, 15, 30));
    expect(parseDueDate("2026-10-01T15:30")?.date).toEqual(date(2026, 10, 1, 15, 30));
    expect(parseDueDate("nope")).toBeNull();
    expect(parseDueDate("2026-13-40")).toBeNull();
  });

  it("fromRows collects open dated rows as due items", () => {
    const config: DatabaseConfig = { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false };
    const row = (id: string, done: boolean, due?: string): Row => {
      const properties: Record<string, PropertyValue> = { Name: { type: "title", title: id }, Done: { type: "checkbox", checkbox: done } };
      if (due) properties["Due"] = { type: "date", date: { start: due } };
      return { id, icon: { type: "none" }, title: id, properties };
    };
    const s = summaryFromRows(
      [row("a", false, "2026-09-30"), row("b", true, "2026-09-30"), row("c", false), row("d", false, "2026-09-30T10:00:00+02:00")],
      config, "2026-09-30", "P");
    expect(s.dueItems.map((d) => d.id)).toEqual(["a", "d"]);
    expect(s.dueItems.every((d) => d.pinId === "P")).toBe(true);
    expect(s.dueItems.map((d) => d.hasTime)).toEqual([false, true]);
  });
});

const pin = (id: string, title: string, kind: PinKind = "dataSource", dated = true): Pin => ({
  id, notionId: id, kind, title, icon: pinIconNone, order: 0,
  ...(kind === "dataSource" ? { config: { doneProperty: "Done", doneKind: "checkbox" as const, showDone: false, ...(dated ? { dateProperty: "Due" } : {}) } } : {}),
});
const summary = (items: DueItem[]): PinSummary => ({ ...emptySummary(), dueItems: items });

describe("TodayAggregator", () => {
  it("groups by pin, drops future items, page pins and undated databases", () => {
    const pins = [pin("p1", "Sprint"), pin("p2", "Home"), pin("page", "Notes", "page"), pin("p3", "NoDate", "dataSource", false), pin("p4", "Empty")];
    const summaries = {
      p1: summary([item("a", date(2026, 9, 30)), item("future", date(2026, 10, 1))]),
      p2: summary([item("b", date(2026, 9, 29), { pin: "p2" })]),
      page: summary([item("z", date(2026, 9, 30), { pin: "page" })]),
      p3: summary([item("y", date(2026, 9, 30), { pin: "p3" })]),
      p4: summary([item("later", date(2026, 12, 1), { pin: "p4" })]),
    };
    const digest = aggregateToday(pins, summaries, now);
    expect(digest.sections.map((s) => s.pinTitle)).toEqual(["Sprint", "Home"]);
    expect(digestOpenCount(digest)).toBe(2);
    expect(digestOverdueCount(digest)).toBe(1);
    expect(digestIsEmpty(digest)).toBe(false);
    expect(digestIsEmpty(aggregateToday(pins, {}, now))).toBe(true);
  });

  it("overdue detection for date-only and timed items", () => {
    const items = [
      item("yesterday", date(2026, 9, 29)), item("todayDateOnly", date(2026, 9, 30)),
      item("timePast", date(2026, 9, 30, 9, 0), { time: true }), item("timeLater", date(2026, 9, 30, 17, 0), { time: true }),
    ];
    const digest = aggregateToday([pin("p1", "Sprint")], { p1: summary(items) }, now);
    expect(Object.fromEntries(digestItems(digest).map((i) => [i.id, i.isOverdue]))).toEqual({
      yesterday: true, todayDateOnly: false, timePast: true, timeLater: false,
    });
  });

  it("sorted by due date then title; sections keep pin order", () => {
    const items = [
      item("c", date(2026, 9, 30), { title: "Charlie" }), item("a", date(2026, 9, 30), { title: "alpha" }),
      item("old", date(2026, 9, 20), { title: "Zulu" }), item("t", date(2026, 9, 30, 16, 0), { time: true, title: "Timed" }),
    ];
    const digest = aggregateToday([pin("p1", "Sprint")], { p1: summary(items) }, now);
    expect(digestItems(digest).map((i) => i.title)).toEqual(["Zulu", "alpha", "Charlie", "Timed"]);
  });
});
