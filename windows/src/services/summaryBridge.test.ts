import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bus = vi.hoisted(() => {
  const handlers = new Map<string, (e: { payload: unknown }) => void>();
  return {
    handlers,
    emit: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn(async (name: string, h: (e: { payload: unknown }) => void) => {
      handlers.set(name, h);
      return () => handlers.delete(name);
    }),
  };
});
vi.mock("@tauri-apps/api/event", () => ({ emit: bus.emit, listen: bus.listen }));

import { emptySummary } from "../domain/store/pinSummary";
import {
  announceContentChanged, openCountsOf, receivedCounts, setReceivedCounts, startSummaryBroadcast, startSummaryReceiver,
} from "./summaryBridge";
import { useSummaryStore } from "./summaryStore";

beforeEach(() => {
  vi.useFakeTimers();
  bus.emit.mockClear();
  bus.handlers.clear();
  setReceivedCounts({});
  useSummaryStore.setState({ summaries: {} });
});
afterEach(() => vi.useRealTimers());

describe("summary bridge", () => {
  it("reduces summaries to open counts", () => {
    const full = { ...emptySummary(), openCount: 4, total: 9 };
    expect(openCountsOf({ a: full })).toEqual({ a: { openCount: 4 } });
  });

  it("hub: broadcasts changed counts after a short debounce and answers requests", async () => {
    const stop = startSummaryBroadcast();
    useSummaryStore.getState().set("p1", { ...emptySummary(), openCount: 3 });
    useSummaryStore.getState().set("p2", { ...emptySummary(), openCount: 1 });
    expect(bus.emit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    expect(bus.emit).toHaveBeenCalledTimes(1);
    expect(bus.emit).toHaveBeenCalledWith("summaries://changed", { p1: { openCount: 3 }, p2: { openCount: 1 } });
    await vi.advanceTimersByTimeAsync(0);
    bus.handlers.get("summaries://request")?.({ payload: null });
    expect(bus.emit).toHaveBeenCalledTimes(2);
    stop();
  });

  it("tray: keeps the counts it receives, asks for them, and reports changes", async () => {
    const changed = vi.fn();
    const stop = await startSummaryReceiver(changed);
    expect(bus.emit).toHaveBeenCalledWith("summaries://request", null);
    bus.handlers.get("summaries://changed")?.({ payload: { p1: { openCount: 5 } } });
    expect(receivedCounts()).toEqual({ p1: { openCount: 5 } });
    expect(changed).toHaveBeenCalled();
    stop();
  });

  it("content changes reach the hub as pin://content-changed", () => {
    announceContentChanged("p9");
    expect(bus.emit).toHaveBeenCalledWith("pin://content-changed", { pinId: "p9" });
  });
});
