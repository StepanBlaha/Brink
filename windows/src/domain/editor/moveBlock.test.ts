import { describe, expect, it } from "vitest";
import { TestEditorHost } from "../../test/editorHost";
import { K } from "../markdown/paragraphKind";
import { d, s } from "./plannerHelpers";
import { plan } from "./syncPlanner";
import { syncedParagraph } from "./types";

const doc = (id: string, content: string, depth = 0) => d(id, content, K.paragraph, { depth });

describe("Moving blocks: planner recreate, Alt+Shift+Up/Down commands, drop depth", () => {
  it("plannerRecreatesMovedBlock: a moved block with children is recreated after its new previous sibling, then the old one deleted", () => {
    const previous = [
      s("a", "A"), s("a1", "A1", K.paragraph, { parent: "a" }), s("a2", "A2", K.paragraph, { parent: "a" }),
      s("b", "B"), s("c", "C"), s("d", "D"),
    ];
    const current = [doc("b", "B"), doc("c", "C"), doc("a", "A"), doc("a1", "A1", 1), doc("a2", "A2", 1), doc("d", "D")];
    expect(plan(previous, current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "c" }, paragraphs: [current[2]] },
      { t: "insert", parent: { t: "pending", localId: "L-a" }, position: { t: "start" }, paragraphs: [current[3], current[4]] },
      { t: "delete", blockId: "a" },
    ]);
  });

  it("plannerPrefersCheapRecreate: swapping two siblings recreates the one without children", () => {
    const previous = [s("a", "A"), s("a1", "A1", K.paragraph, { parent: "a" }), s("b", "B")];
    const current = [doc("b", "B"), doc("a", "A"), doc("a1", "A1", 1)];
    expect(plan(previous, current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "start" }, paragraphs: [current[0]] },
      { t: "delete", blockId: "b" },
    ]);
  });

  const host = (): TestEditorHost => new TestEditorHost([
    syncedParagraph({ blockId: "a", kind: K.bulleted, content: "Alpha" }),
    syncedParagraph({ blockId: "a1", parentId: "a", kind: K.paragraph, content: "child" }),
    syncedParagraph({ blockId: "b", kind: K.toDo(true), content: "Beta" }),
  ]);
  const order = (h: TestEditorHost): string[] => h.paragraphs().map((p) => `${p.blockId ?? "-"}@${p.depth}`);

  it("keyboardMove: moves the block with its children below the next one; undo restores; moving up works", () => {
    const h = host();
    expect(h.moveBlockDown(0)).toBe(true);
    expect(order(h)).toEqual(["b@0", "a@0", "a1@1"]);
    expect(h.text()).toBe("Beta\nAlpha\nchild");
    expect(h.hasKinds([K.toDo(true), K.bulleted, K.paragraph])).toBe(true);
    expect(h.moveBlockDown(1)).toBe(false); // already last

    h.undo();
    expect(order(h)).toEqual(["a@0", "a1@1", "b@0"]);
    expect(h.text()).toBe("Alpha\nchild\nBeta");

    expect(h.moveBlockUp(2)).toBe(true);
    expect(order(h)).toEqual(["b@0", "a@0", "a1@1"]);
    expect(h.moveBlockUp(0)).toBe(false); // already first
  });

  it("dropIntoNesting: dropping at a deeper x nests the block (depth clamped to one below the line above)", () => {
    const h = host();
    expect(h.maxDepthForMove(2, 1)).toBe(1);
    expect(h.moveBlock(2, 1, 3)).toBe(true);
    expect(order(h)).toEqual(["a@0", "b@1", "a1@1"]);
    // Planner: b changed parent, recreated under a (first child), old b deleted.
    const previous = [
      syncedParagraph({ blockId: "a", kind: K.bulleted, content: "Alpha" }),
      syncedParagraph({ blockId: "a1", parentId: "a", kind: K.paragraph, content: "child" }),
      syncedParagraph({ blockId: "b", kind: K.toDo(true), content: "Beta" }),
    ];
    const ops = plan(previous, h.paragraphs());
    expect(ops).toHaveLength(2);
    const first = ops[0]!;
    expect(first.t).toBe("insert");
    if (first.t === "insert") {
      expect(first.parent).toEqual({ t: "block", id: "a" });
      expect(first.position).toEqual({ t: "start" });
      expect(first.paragraphs.map((p) => p.content)).toEqual(["Beta"]);
    }
    expect(ops[1]).toEqual({ t: "delete", blockId: "b" });

    // ...and out again: to the top level at the end.
    expect(h.moveBlock(1, 3, 0)).toBe(true);
    expect(order(h)).toEqual(["a@0", "a1@1", "b@0"]);
  });

  it("noDropIntoSelf: a block can't be dropped into its own children", () => {
    const h = host();
    expect(h.moveBlock(0, 1, 0)).toBe(false);
    expect(h.moveBlock(0, 2, 0)).toBe(false);
    expect(order(h)).toEqual(["a@0", "a1@1", "b@0"]);
  });
});
