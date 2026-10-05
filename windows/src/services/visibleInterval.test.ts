import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visibleInterval } from "./visibleInterval";

function fakeDoc(state: "visible" | "hidden") {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: state,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  return { doc: doc as unknown as Document, set: (s: "visible" | "hidden") => { doc.visibilityState = s; listeners.forEach((l) => l()); } };
}

describe("visibleInterval", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs on every tick while visible", () => {
    const { doc } = fakeDoc("visible");
    const fn = vi.fn();
    const stop = visibleInterval(fn, 1000, doc);
    vi.advanceTimersByTime(3000);
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
  });

  it("does not run while hidden and catches up once when shown", () => {
    const { doc, set } = fakeDoc("hidden");
    const fn = vi.fn();
    const stop = visibleInterval(fn, 1000, doc);
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
    set("visible");
    expect(fn).toHaveBeenCalledTimes(1);
    set("visible");
    expect(fn).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
