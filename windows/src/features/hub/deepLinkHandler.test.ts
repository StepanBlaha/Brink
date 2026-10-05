import { describe, expect, it } from "vitest";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Pin } from "../../domain/store/pin";
import type { QueueOutcome } from "../../ipc/types";
import { handleDeepLink } from "./deepLinkHandler";

const page: Pin = { id: "p1", notionId: "page-1", kind: "page", title: "Inbox", icon: { none: {} }, order: 0 };
const db: Pin = { id: "p2", notionId: "ds-1", kind: "dataSource", title: "Buylist", icon: { none: {} }, order: 1 };

function ctx(pins: Pin[] = [page, db], out: QueueOutcome = { kind: "saved" }, last?: string) {
  const c = { opened: [] as string[], ops: [] as Operation[], toasts: [] as [string, boolean][] };
  const ports = {
    pins: () => pins,
    quickCaptureLastPinId: () => last,
    openPin: (id: string) => c.opened.push(id),
    submit: async (op: Operation) => { c.ops.push(op); return out; },
    toast: (m: string, e: boolean) => c.toasts.push([m, e]),
    contentChanged: () => {},
    now: () => new Date(2026, 8, 29, 10, 0),
  };
  return { c, ports };
}

describe("handleDeepLink", () => {
  it("brink://pin/<id> opens the pin", async () => {
    const { c, ports } = ctx();
    expect(await handleDeepLink("brink://pin/p2", ports)).toBe(true);
    expect(c.opened).toEqual(["p2"]);
  });
  it("an unknown pin toasts", async () => {
    const { c, ports } = ctx();
    await handleDeepLink("brink://pin/zzz", ports);
    expect(c.opened).toEqual([]);
    expect(c.toasts[0]?.[1]).toBe(true);
  });
  it("brink://capture?text=Milk goes to the first pin by default as a to-do", async () => {
    const { c, ports } = ctx();
    await handleDeepLink("brink://capture?text=Milk", ports);
    expect(c.ops[0]).toMatchObject({ kind: "appendBlock", parentId: "page-1" });
    expect(c.toasts).toEqual([["Added to Inbox ✓", false]]);
  });
  it("capture honours pin, url and the last quick-capture pin", async () => {
    const a = ctx();
    await handleDeepLink("brink://capture?text=Milk&pin=p2", a.ports);
    expect(a.c.ops[0]).toMatchObject({ kind: "createRow", dataSourceId: "ds-1", title: "Milk" });
    const b = ctx([page, db], { kind: "saved" }, "p2");
    await handleDeepLink("brink://capture?text=Read&url=https%3A%2F%2Fa.b", b.ports);
    expect(b.c.ops[0]).toMatchObject({ kind: "createRow", title: "Read https://a.b" });
  });
  it("offline, failed and no pins", async () => {
    const q = ctx([page], { kind: "queued", message: "x" });
    await handleDeepLink("brink://capture?text=a", q.ports);
    expect(q.c.toasts).toEqual([["Saved offline, will sync", false]]);
    const f = ctx([page], { kind: "failed", message: "No access" });
    await handleDeepLink("brink://capture?text=a", f.ports);
    expect(f.c.toasts).toEqual([["No access", true]]);
    const n = ctx([]);
    await handleDeepLink("brink://capture?text=a", n.ports);
    expect(n.c.toasts).toEqual([["Pin a page or database first.", true]]);
  });
  it("garbage is not understood", async () => {
    expect(await handleDeepLink("https://x", ctx().ports)).toBe(false);
  });
});
