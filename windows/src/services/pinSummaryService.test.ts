import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "../domain/notion/block";
import { span } from "../domain/notion/richText";
import { pinIconNone, type Pin } from "../domain/store/pin";
import { PinSummaryService, childFetchLimit, type SummaryPorts } from "./pinSummaryService";
import { useSummaryStore } from "./summaryStore";

const todo = (id: string, text: string, checked = false, hasChildren = false): Block => ({
  id, type: { kind: "toDo", checked }, hasChildren, richText: [span(text)],
});
const page = (id: string): Pin => ({ id, notionId: `n-${id}`, kind: "page", title: id, icon: pinIconNone, order: 0 });

function ports(pins: Pin[], over: Partial<SummaryPorts> = {}): SummaryPorts & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls, pins: () => pins, hasToken: () => true,
    blockChildren: async (id) => {
      calls.push(id);
      return id.startsWith("n-") ? [todo(`${id}-a`, "a")] : [todo(`${id}-c`, "child")];
    },
    queryRows: async () => [], cachedBlocks: async () => null, cachedRows: async () => null, changed: () => {}, ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useSummaryStore.getState().replace({});
});
afterEach(() => vi.useRealTimers());

describe("PinSummaryService", () => {
  it("shows the cache first, then refreshes staggered 0.4 s per pin", async () => {
    const p = ports([page("a"), page("b"), page("c")], { cachedBlocks: async (id) => [todo(`${id}-cached`, "x", true)] });
    const s = new PinSummaryService(p);
    s.start();
    expect(p.calls).toEqual([]);
    await Promise.resolve();
    expect(useSummaryStore.getState().summaries["a"]?.doneCount).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(p.calls).toEqual(["n-a"]);
    await vi.advanceTimersByTimeAsync(400);
    expect(p.calls).toEqual(["n-a", "n-b"]);
    await vi.advanceTimersByTimeAsync(400);
    expect(p.calls).toEqual(["n-a", "n-b", "n-c"]);
    expect(useSummaryStore.getState().summaries["a"]?.openCount).toBe(1);
    s.stop();
  });

  it("refreshes every 300 s, staggered 0.6 s", async () => {
    const p = ports([page("a"), page("b")]);
    const s = new PinSummaryService(p);
    s.start();
    await vi.advanceTimersByTimeAsync(1000);
    p.calls.length = 0;
    await vi.advanceTimersByTimeAsync(298_900);
    expect(p.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(p.calls).toEqual(["n-a"]);
    await vi.advanceTimersByTimeAsync(600);
    expect(p.calls).toEqual(["n-a", "n-b"]);
    s.stop();
  });

  it("runs one refresh per pin at a time and one more afterwards", async () => {
    let release: (() => void) | undefined;
    let n = 0;
    const p = ports([page("a")], {
      blockChildren: () => { n += 1; return new Promise((r) => { release = () => r([]); }); },
    });
    const s = new PinSummaryService(p);
    s.refresh("a");
    s.refresh("a");
    s.refresh("a");
    expect(n).toBe(1);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(2);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(n).toBe(2);
  });

  it("fetches children of at most 6 child-bearing blocks", async () => {
    const top = Array.from({ length: 9 }, (_, i) => todo(`t${i}`, `t${i}`, false, true));
    const p = ports([page("a")], {
      blockChildren: async (id) => (id === "n-a" ? top : [todo(`${id}-c`, "child")]),
    });
    const s = new PinSummaryService(p);
    s.refresh("a");
    await vi.advanceTimersByTimeAsync(0);
    expect(childFetchLimit).toBe(6);
    expect(useSummaryStore.getState().summaries["a"]?.total).toBe(9 + 6);
  });

  it("only fetches children of to-do, toggle and list blocks", async () => {
    const quote: Block = { id: "q", type: { kind: "quote" }, hasChildren: true, richText: [] };
    const calls: string[] = [];
    const p = ports([page("a")], { blockChildren: async (id) => { calls.push(id); return id === "n-a" ? [quote] : []; } });
    new PinSummaryService(p).refresh("a");
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["n-a"]);
  });

  it("does nothing without a token, keeps the old summary on failure, prunes removed pins", async () => {
    const pins = [page("a"), page("b")];
    const p = ports(pins, { hasToken: () => false });
    new PinSummaryService(p).refresh("a");
    expect(p.calls).toEqual([]);
    useSummaryStore.getState().replace({ a: { ...useSummaryStore.getState().summaries["a"]!, total: 4 } as never });
    const failing = ports(pins, { blockChildren: async () => { throw new Error("offline"); } });
    const s = new PinSummaryService(failing);
    s.refresh("a");
    await vi.advanceTimersByTimeAsync(0);
    expect(useSummaryStore.getState().summaries["a"]?.total).toBe(4);
    s.start();
    pins.pop();
    useSummaryStore.getState().set("b", { ...useSummaryStore.getState().summaries["a"]! });
    s.pinsDidChange();
    expect(Object.keys(useSummaryStore.getState().summaries)).toEqual(["a"]);
    s.stop();
  });
});
