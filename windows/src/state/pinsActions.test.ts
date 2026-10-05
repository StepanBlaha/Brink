import { beforeEach, describe, expect, it, vi } from "vitest";

const c = vi.hoisted(() => ({
  pinsGet: vi.fn(), pinsAdd: vi.fn(), pinsRemove: vi.fn(), pinsUpdate: vi.fn(), pinsMoveWithinGroup: vi.fn(),
  pinsMoveAmongAll: vi.fn(), pinsSetGroup: vi.fn(),
}));
vi.mock("../ipc/commands", () => c);

import type { Pin } from "../domain/store/pin";
import { usePinsStore } from "./pinsStore";

const pin = (id: string, order: number): Pin => ({ id, notionId: id, kind: "page", title: id, icon: { none: {} }, order });

beforeEach(() => {
  vi.clearAllMocks();
  usePinsStore.setState({ pins: [pin("a", 0), pin("b", 1), pin("c", 2)] });
});

describe("pins actions", () => {
  it("add appends with order max + 1 and calls Rust", async () => {
    await usePinsStore.getState().add(pin("d", 0));
    expect(usePinsStore.getState().pins.map((p) => [p.id, p.order])).toEqual([["a", 0], ["b", 1], ["c", 2], ["d", 3]]);
    expect(c.pinsAdd).toHaveBeenCalledOnce();
  });
  it("move among all and within a group", async () => {
    await usePinsStore.getState().move("a", 2, undefined);
    expect(usePinsStore.getState().pins.map((p) => p.id)).toEqual(["b", "c", "a"]);
    expect(c.pinsMoveAmongAll).toHaveBeenCalledWith("a", 2);
    await usePinsStore.getState().move("c", 0, "g");
    expect(c.pinsMoveWithinGroup).toHaveBeenCalledWith("c", 0, "g");
  });
  it("remove and setGroup", async () => {
    await usePinsStore.getState().setGroup("b", "g1");
    expect(usePinsStore.getState().pins.find((p) => p.id === "b")?.groupId).toBe("g1");
    await usePinsStore.getState().remove("a");
    expect(usePinsStore.getState().pins.map((p) => p.id)).toEqual(["b", "c"]);
  });
  it("resyncs from Rust when a call fails", async () => {
    c.pinsRemove.mockRejectedValue(new Error("no"));
    c.pinsGet.mockResolvedValue([pin("a", 0), pin("b", 1), pin("c", 2)]);
    await expect(usePinsStore.getState().remove("a")).rejects.toThrow();
    expect(usePinsStore.getState().pins).toHaveLength(3);
  });
});
