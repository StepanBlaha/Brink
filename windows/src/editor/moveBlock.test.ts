import { describe, expect, it } from "vitest";
import { K } from "../domain/markdown/paragraphKind";
import { plan } from "../domain/editor/syncPlanner";
import { syncedParagraph } from "../domain/editor/types";
import { block, PMHost } from "../test/pmHost";
import { maxDepthFor, moveBlockTr } from "./keymap/moveBlock";

const previous = () => [
  syncedParagraph({ blockId: "a", kind: K.bulleted, content: "Alpha" }),
  syncedParagraph({ blockId: "a1", parentId: "a", kind: K.paragraph, content: "child" }),
  syncedParagraph({ blockId: "b", kind: K.toDo(true), content: "Beta" }),
];
const host = () => new PMHost(previous());
const order = (h: PMHost) => h.doc.paragraphs().map((p) => `${p.blockId ?? "-"}@${p.depth}`);
const move = (h: PMHost, at: number, before: number, depth: number): boolean => {
  const tr = moveBlockTr(h.state, at, before, depth);
  if (tr) h.view.dispatch(tr);
  return tr !== null;
};

describe("Moving blocks on ProseMirror (MoveBlockTests UI parts)", () => {
  it("Alt+Shift+Down moves the block with its children; undo restores; Alt+Shift+Up moves back", () => {
    const h = host();
    h.caret(0, 2);
    expect(h.key("ArrowDown", { alt: true, shift: true })).toBe(true);
    expect(order(h)).toEqual(["b@0", "a@0", "a1@1"]);
    expect(h.text).toBe("Beta\nAlpha\nchild");
    expect(h.kinds).toEqual([K.toDo(true), K.bulleted, K.paragraph]);
    expect(h.state.selection.$from.index(0)).toBe(1);
    h.caret(1, 0);
    expect(h.key("ArrowDown", { alt: true, shift: true })).toBe(false); // already last
    h.undo();
    expect(order(h)).toEqual(["a@0", "a1@1", "b@0"]);
    h.caret(2, 0);
    expect(h.key("ArrowUp", { alt: true, shift: true })).toBe(true);
    expect(order(h)).toEqual(["b@0", "a@0", "a1@1"]);
    h.caret(0, 0);
    expect(h.key("ArrowUp", { alt: true, shift: true })).toBe(false); // already first
  });

  it("dropping at a deeper x nests the block; the planner recreates it under its new parent", () => {
    const h = host();
    expect(maxDepthFor(h.state, 2, 1)).toBe(1);
    expect(move(h, 2, 1, 3)).toBe(true);
    expect(order(h)).toEqual(["a@0", "b@1", "a1@1"]);
    const ops = plan(previous(), h.doc.paragraphs());
    expect(ops).toHaveLength(2);
    const first = ops[0]!;
    expect(first.t === "insert" && first.parent).toEqual({ t: "block", id: "a" });
    expect(ops[1]).toEqual({ t: "delete", blockId: "b" });
    expect(move(h, 1, 3, 0)).toBe(true);
    expect(order(h)).toEqual(["a@0", "a1@1", "b@0"]);
  });

  it("a block can't be dropped into its own children", () => {
    const h = host();
    expect(move(h, 0, 1, 0)).toBe(false);
    expect(move(h, 0, 2, 0)).toBe(false);
    expect(order(h)).toEqual(["a@0", "a1@1", "b@0"]);
  });

  it("ids survive a move (no duplicate, no null)", () => {
    const h = new PMHost([block("x", "X"), block("y", "Y")]);
    move(h, 0, 2, 0);
    expect(order(h)).toEqual(["y@0", "x@0"]);
  });
});
