import { describe, expect, it, vi } from "vitest";
import type { Block } from "../../domain/notion/block";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Pin } from "../../domain/store/pin";
import type { QueueOutcome } from "../../ipc/types";
import { span } from "../../domain/notion/richText";
import { MiniListModel, openTodos, type MiniPorts } from "./miniListModel";

const pin = (id: string, order: number): Pin => ({ id, notionId: `n-${id}`, kind: "page", title: id, icon: { none: {} }, order });
const todo = (id: string, text: string, checked = false): Block => ({
  id, type: { kind: "toDo", checked }, hasChildren: false, richText: text ? [span(text)] : [],
});

function make(opts: { outcome?: QueueOutcome; last?: string; token?: boolean } = {}) {
  const ops: Operation[] = [];
  const ticks = vi.fn();
  const changed = vi.fn();
  const ports: MiniPorts = {
    pins: () => [pin("b", 2), pin("a", 1)],
    groups: () => [],
    activeGroupId: () => undefined,
    lastOpenedPinId: () => opts.last,
    summaries: () => ({}),
    hasToken: () => opts.token ?? true,
    cachedBlocks: async () => null,
    pageBlocks: async () => [todo("t1", "Milk"), todo("t2", "Bread"), todo("t3", "done", true), todo("t4", "")],
    databaseModel: () => null,
    submit: async (op) => { ops.push(op); return opts.outcome ?? { kind: "saved" }; },
    tick: ticks,
    contentChanged: changed,
  };
  return { model: new MiniListModel(ports), ops, ticks, changed };
}

describe("MiniListModel", () => {
  it("lists open top-level to-dos with Untitled for empty ones", () => {
    expect(openTodos([todo("1", "A"), todo("2", "B", true), todo("3", "")])).toEqual([
      { id: "1", title: "A" }, { id: "3", title: "Untitled" },
    ]);
  });

  it("target is the last opened pin, else the first section", () => {
    expect(make({ last: "b" }).model.targetPin?.id).toBe("b");
    expect(make({ last: "gone" }).model.targetPin?.id).toBe("a");
    expect(make().model.sections.map((s) => s.pinID)).toEqual(["a", "b"]);
  });

  it("expanding loads lazily and the query filters case-insensitively", async () => {
    const { model } = make();
    model.toggleExpanded("a");
    await model.load("a");
    expect(model.visibleItems("a").map((i) => i.title)).toEqual(["Milk", "Bread", "Untitled"]);
    model.setQuery("BRE");
    expect(model.visibleItems("a").map((i) => i.title)).toEqual(["Bread"]);
    expect(model.selectedPinId).toBe("a");
  });

  it("no token loads nothing", async () => {
    const { model } = make({ token: false });
    await model.load("a");
    expect(model.visibleItems("a")).toEqual([]);
  });

  it("check hides optimistically, ticks and writes to_do.checked", async () => {
    const { model, ops, ticks, changed } = make();
    await model.load("a");
    const item = model.visibleItems("a")[0]!;
    const p = model.check(item, model.pinById("a")!);
    expect(model.visibleItems("a").some((i) => i.id === item.id)).toBe(false);
    await p;
    expect(ticks).toHaveBeenCalled();
    expect(ops[0]).toEqual({ kind: "updateBlock", blockId: "t1", type: "to_do", update: { kind: "checked", checked: true } });
    expect(changed).toHaveBeenCalledWith("a");
    expect(model.visibleItems("a").some((i) => i.id === "t1")).toBe(false);
  });

  it("a failed check unhides the item and shows the message", async () => {
    const { model } = make({ outcome: { kind: "failed", message: "No access" } });
    await model.load("a");
    await model.check(model.visibleItems("a")[0]!, model.pinById("a")!);
    expect(model.visibleItems("a")[0]?.id).toBe("t1");
    expect(model.message).toBe("No access");
  });

  it("quick add appends a temp item, writes appendBlock and clears the field", async () => {
    const { model, ops } = make();
    model.setQuery("Call mom");
    await model.quickAdd();
    expect(ops[0]).toEqual({ kind: "appendBlock", parentId: "n-a", block: { kind: "toDo", text: "Call mom", checked: false } });
    expect(model.query).toBe("");
    expect(model.expanded.has("a")).toBe(true);
  });

  it("a failed quick add removes the temp item", async () => {
    const { model } = make({ outcome: { kind: "failed", message: "Offline" } });
    model.setQuery("x");
    await model.quickAdd();
    expect(model.visibleItems("a")).toEqual([]);
    expect(model.message).toBe("Offline");
  });
});
