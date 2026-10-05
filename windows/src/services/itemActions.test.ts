import { describe, expect, it, vi } from "vitest";
import type { Operation } from "../domain/notion/pendingWrite";
import { pinIconNone, type Pin } from "../domain/store/pin";
import type { TodayItem } from "../domain/store/todayAggregator";
import type { QueueOutcome } from "../ipc/types";
import { ItemActions } from "./itemActions";

const db: Pin = { id: "p1", notionId: "n1", kind: "dataSource", title: "Sprint", icon: pinIconNone, order: 0,
  config: { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false } };
const page: Pin = { id: "pg", notionId: "npg", kind: "page", title: "Notes", icon: pinIconNone, order: 1 };

function make(outcome: QueueOutcome = { kind: "saved" }) {
  const ops: Operation[] = [];
  const toast = vi.fn();
  const changed = vi.fn();
  const a = new ItemActions({
    pins: () => [db, page], submit: async (op) => (ops.push(op), outcome), toast, contentChanged: changed,
    now: () => new Date(2026, 8, 30, 12, 0),
  });
  return { a, ops, toast, changed };
}
const item = (o: Partial<TodayItem> = {}): TodayItem => ({
  id: "r1", pinId: "p1", title: "x", due: new Date(2026, 8, 30, 15, 0), hasTime: true, isOverdue: false, ...o,
});

describe("ItemActions", () => {
  it("markDone queues the done property for a database row and refreshes the pin", async () => {
    const { a, ops, changed } = make();
    expect(await a.markDone("p1", "r1")).toBe(true);
    expect(ops[0]).toEqual({ kind: "toggleDone", pageId: "r1", update: { name: "Done", value: { type: "checkbox", checkbox: true } } });
    expect(changed).toHaveBeenCalledWith("p1");
  });
  it("markDone checks a page to-do block", async () => {
    const { a, ops } = make();
    await a.markDone("pg", "b1");
    expect(ops[0]).toMatchObject({ kind: "updateBlock", blockId: "b1", type: "to_do" });
  });
  it("unknown pin does nothing", async () => {
    const { a, ops } = make();
    expect(await a.markDone("nope", "r1")).toBe(false);
    expect(ops).toEqual([]);
  });
  it("a failed write toasts and reports false, but still refreshes", async () => {
    const { a, toast, changed } = make({ kind: "failed", message: "Nope" });
    expect(await a.markDone("p1", "r1")).toBe(false);
    expect(toast).toHaveBeenCalledWith("Nope", true);
    expect(changed).toHaveBeenCalled();
  });
  it("snooze tomorrow keeps the time of day", async () => {
    const { a, ops } = make();
    expect(await a.snooze(item(), "tomorrow")).toBe(true);
    const op = ops[0];
    expect(op?.kind === "updateProperty" && op.updates[0]?.value).toMatchObject({ type: "date", date: { start: expect.stringMatching(/^2026-10-01T15:00:00/) } });
  });
  it("later today needs a time", async () => {
    const { a, ops } = make();
    expect(await a.snooze(item({ hasTime: false }), "laterToday")).toBe(false);
    expect(ops).toEqual([]);
  });
});
