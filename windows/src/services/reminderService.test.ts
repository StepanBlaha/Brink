import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DueItem } from "../domain/store/dueItem";
import { pinIconNone, type Pin } from "../domain/store/pin";
import { emptySummary, type PinSummary } from "../domain/store/pinSummary";
import { reminderSettings } from "../domain/store/reminderPlanner";
import type { NotifyWire } from "../ipc/notifyIpc";
import { ReminderService, type ReminderPorts } from "./reminderService";

const NOW = new Date(2026, 8, 30, 12, 0);
const db = (id: string, title = id): Pin => ({
  id, notionId: id, kind: "dataSource", title, icon: pinIconNone, order: 0,
  config: { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false },
});
const due = (id: string, pin: string, at: Date, hasTime = true): DueItem => ({ id, pinId: pin, title: `T-${id}`, due: at, hasTime });
const summary = (items: DueItem[]): PinSummary => ({ ...emptySummary(), dueItems: items });
const at = (h: number, m = 0): Date => new Date(2026, 8, 30, h, m);

function setup(o: { pins?: Pin[]; summaries?: Record<string, PinSummary>; pending?: NotifyWire[]; enabled?: boolean } = {}) {
  const calls = { add: [] as NotifyWire[][], remove: [] as string[][], peek: [] as string[], done: [] as string[], opened: [] as string[], ticks: 0 };
  let now = NOW;
  const ports: ReminderPorts = {
    enabled: () => o.enabled ?? true, peekEnabled: () => true, settings: () => reminderSettings(),
    pins: () => o.pins ?? [], summaries: () => o.summaries ?? {},
    pending: async () => o.pending ?? [],
    apply: async (a, r) => void (calls.add.push(a), calls.remove.push(r)),
    now: () => now, peek: (p) => calls.peek.push(p),
    markDone: async (p, i) => (calls.done.push(`${p}/${i}`), true), tick: () => void (calls.ticks += 1),
    openPin: (p) => calls.opened.push(p), snoozeSeconds: () => 3600,
  };
  return { svc: new ReminderService(ports), calls, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}
const wire = (identifier: string, pinId: string, itemId: string, kind: NotifyWire["kind"] = "item"): NotifyWire => ({
  identifier, kind, title: "t", body: "b", fireAtMs: NOW.getTime() + 1e6, pinId, itemId,
});

beforeEach(() => vi.useFakeTimers({ now: NOW }));
afterEach(() => vi.useRealTimers());

describe("ReminderService", () => {
  it("schedules a timed item 2 minutes ahead with the planner's content", async () => {
    const { svc, calls } = setup({ pins: [db("p1", "Sprint")], summaries: { p1: summary([due("i1", "p1", at(12, 2))]) } });
    await svc.reschedule();
    expect(calls.add[0]).toHaveLength(1);
    expect(calls.add[0]?.[0]).toMatchObject({
      identifier: "brink.reminder.item.p1.i1", kind: "item", title: "T-i1", fireAtMs: at(12, 2).getTime(), pinId: "p1", itemId: "i1",
    });
    expect(calls.add[0]?.[0]?.body).toMatch(/^Sprint · Due at /);
  });

  it("keeps toasts of pins whose summary has not loaded and reserves their slots", async () => {
    const kept = wire("brink.reminder.item.p2.old", "p2", "old");
    const { svc, calls } = setup({
      pins: [db("p1"), db("p2")], summaries: { p1: summary([due("i1", "p1", at(13))]) }, pending: [kept, wire("brink.snooze.s", "p1", "i1", "snooze")],
    });
    await svc.reschedule();
    expect(calls.remove[0]).not.toContain(kept.identifier);
    expect(calls.add[0]).toHaveLength(1);
  });

  it("cap 64 includes kept toasts and live snoozes", async () => {
    const items = Array.from({ length: 100 }, (_, i) => due(`i${i}`, "p1", at(13, i % 60)));
    const keptOnes = Array.from({ length: 4 }, (_, i) => wire(`brink.reminder.item.p2.k${i}`, "p2", `k${i}`));
    const { svc, calls } = setup({ pins: [db("p1"), db("p2")], summaries: { p1: summary(items) }, pending: keptOnes });
    await svc.reschedule();
    expect(calls.add[0]).toHaveLength(60);
  });

  it("removes stale snoozes (item gone) and managed toasts no longer planned", async () => {
    const stale = wire("brink.snooze.gone", "p1", "gone", "snooze");
    const live = wire("brink.snooze.i1", "p1", "i1", "snooze");
    const old = wire("brink.reminder.item.p1.x", "p1", "x");
    const { svc, calls } = setup({ pins: [db("p1")], summaries: { p1: summary([due("i1", "p1", at(13))]) }, pending: [stale, live, old] });
    await svc.reschedule();
    expect(calls.remove[0]?.sort()).toEqual(["brink.reminder.item.p1.x", "brink.snooze.gone"]);
  });

  it("turns everything off when reminders are disabled", async () => {
    const { svc, calls } = setup({ enabled: false, pending: [wire("brink.reminder.item.p.i", "p", "i"), wire("brink.snooze.i", "p", "i", "snooze")] });
    await svc.reschedule();
    expect(calls.add[0]).toEqual([]);
    expect(calls.remove[0]).toHaveLength(2);
  });

  it("debounces: 1.5 s at start, 0.3 s on settings, 1.0 s on summaries", async () => {
    const { svc, calls } = setup();
    svc.start();
    await vi.advanceTimersByTimeAsync(1400);
    expect(calls.add).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls.add).toHaveLength(1);
    svc.settingsDidChange();
    await vi.advanceTimersByTimeAsync(300);
    expect(calls.add).toHaveLength(2);
    svc.summariesDidChange();
    svc.summariesDidChange();
    await vi.advanceTimersByTimeAsync(999);
    expect(calls.add).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.add).toHaveLength(3);
    svc.stop();
  });

  it("peeks the pin when its reminder fires", async () => {
    const { svc, calls } = setup({ pins: [db("p1")], summaries: { p1: summary([due("i1", "p1", at(12, 2))]) } });
    await svc.reschedule();
    await vi.advanceTimersByTimeAsync(119_000);
    expect(calls.peek).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.peek).toEqual(["p1"]);
    svc.stop();
  });
});

describe("toast actions", () => {
  it("done ticks, marks the item done and cancels its snooze", async () => {
    const { svc, calls } = setup();
    await svc.handleAction("done", "p1", "i1");
    expect(calls.ticks).toBe(1);
    expect(calls.done).toEqual(["p1/i1"]);
    expect(calls.remove[0]).toEqual(["brink.snooze.i1"]);
  });

  it("snooze re-delivers the same content after 3600 s", async () => {
    const { svc, calls } = setup({ pins: [db("p1", "Sprint")], summaries: { p1: summary([due("i1", "p1", at(12, 2))]) } });
    await svc.handleAction("snooze", "p1", "i1");
    const r = calls.add[0]?.[0];
    expect(r).toMatchObject({ identifier: "brink.snooze.i1", kind: "snooze", title: "T-i1", pinId: "p1", itemId: "i1" });
    expect(r?.fireAtMs).toBe(NOW.getTime() + 3600_000);
    expect(r?.body).toMatch(/^Sprint/);
  });

  it("open (and a click on the toast) opens the pin", async () => {
    const { svc, calls } = setup();
    await svc.handleAction("open", "p1", "i1");
    await svc.handleAction("open", "brink.today", "");
    await svc.handleAction("open", "", "");
    expect(calls.opened).toEqual(["p1", "brink.today"]);
  });
});
