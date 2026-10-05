import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/commands", () => ({ notionSearch: search }));

import { usePinSearch } from "./usePinSearch";

const r = (id: string) => ({ id, kind: "page" as const, title: id, icon: { type: "none" as const } });

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("usePinSearch", () => {
  it("searches at once, then debounces 300 ms", async () => {
    search.mockResolvedValue([r("a")]);
    const { result, rerender } = renderHook(({ q }) => usePinSearch(q), { initialProps: { q: "" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenLastCalledWith("");
    expect(result.current.results).toHaveLength(1);

    rerender({ q: "ta" });
    rerender({ q: "task" });
    await act(async () => void (await vi.advanceTimersByTimeAsync(299)));
    expect(search).toHaveBeenCalledTimes(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenLastCalledWith("task");
  });

  it("ignores a slow answer for an older query", async () => {
    let resolveOld: (v: unknown) => void = () => undefined;
    search.mockImplementationOnce(() => new Promise((res) => (resolveOld = res)));
    search.mockResolvedValueOnce([r("new")]);
    const { result, rerender } = renderHook(({ q }) => usePinSearch(q), { initialProps: { q: "" } });
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    rerender({ q: "x" });
    await act(async () => void (await vi.advanceTimersByTimeAsync(300)));
    await act(async () => resolveOld([r("old")]));
    expect(result.current.results.map((x) => x.id)).toEqual(["new"]);
  });

  it("reports an error message", async () => {
    search.mockRejectedValue({ kind: "auth", message: "Token rejected." });
    const { result } = renderHook(() => usePinSearch("a"));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(result.current.error).toBe("Token rejected.");
    expect(result.current.results).toEqual([]);
  });
});
