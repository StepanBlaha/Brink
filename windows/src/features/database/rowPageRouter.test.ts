import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RowPageRouter } from "./rowPageRouter";

const target = { pinId: "p", rowId: "r", title: "Row" };

describe("RowPageRouter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("open asks the notch for the pin and keeps the row pending", () => {
    const ask = vi.fn();
    const router = new RowPageRouter(ask);
    router.open(target);
    expect(ask).toHaveBeenCalledWith("p");
    expect(router.pending).toEqual(target);
  });

  it("take returns the row once and only for its pin", () => {
    const router = new RowPageRouter(() => {});
    router.open(target);
    expect(router.take("other")).toBeNull();
    expect(router.pending).toEqual(target);
    expect(router.take("p")).toEqual(target);
    expect(router.take("p")).toBeNull();
  });

  it("an unclaimed request expires after 3 seconds", () => {
    const router = new RowPageRouter(() => {});
    router.open(target);
    vi.advanceTimersByTime(2999);
    expect(router.pending).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(router.pending).toBeNull();
  });

  it("an old timer does not clear a newer request", () => {
    const router = new RowPageRouter(() => {});
    router.open(target);
    vi.advanceTimersByTime(2000);
    const next = { ...target, rowId: "r2" };
    router.open(next);
    vi.advanceTimersByTime(1500);
    expect(router.pending).toEqual(next);
  });

  it("notifies subscribers", () => {
    const router = new RowPageRouter(() => {});
    const fn = vi.fn();
    router.subscribe(fn);
    router.open(target);
    router.take("p");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
