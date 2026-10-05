import { describe, expect, it } from "vitest";
import { K } from "../domain/markdown/paragraphKind";
import { plan } from "../domain/editor/syncPlanner";
import { block, PMHost } from "../test/pmHost";
import { syncedParagraph } from "../domain/editor/types";

const ids = (h: PMHost) => h.ids;
const contents = (h: PMHost) => h.doc.paragraphs().map((p) => p.content);

describe("EditorDocument identity (real ProseMirror state)", () => {
  it("empty paragraphs load as empty lines and survive with their ids", () => {
    const blocks = [block("a", "A"), block("e1", ""), block("e2", ""), block("b", "B"), block("e3", "")];
    const h = new PMHost(blocks);
    expect(h.text).toBe("A\n\n\nB\n");
    expect(ids(h)).toEqual(["a", "e1", "e2", "b", "e3"]);
    expect(plan(blocks, h.doc.paragraphs())).toEqual([]);
    h.caret(0, 1);
    h.type("!");
    expect(ids(h)).toEqual(["a", "e1", "e2", "b", "e3"]);
  });

  it("Enter mid-line: top keeps the id, bottom is new; at the start the line keeps its id", () => {
    const h = new PMHost([block("a", "HelloWorld"), block("b", "B")]);
    h.caret(0, 5);
    h.enter();
    expect(contents(h)).toEqual(["Hello", "World", "B"]);
    expect(ids(h)).toEqual(["a", null, "b"]);
    const s = new PMHost([block("a", "Hello")]);
    s.caret(0, 0);
    s.enter();
    expect(ids(s)).toEqual([null, "a"]);
  });

  it("Enter at end then typing keeps one stable local id; stamping does not touch text", () => {
    const h = new PMHost([block("a", "A"), block("b", "B")]);
    h.caret(0, 1);
    h.enter();
    const local = h.doc.paragraphs()[1]!.localId;
    h.type("new");
    expect(contents(h)).toEqual(["A", "new", "B"]);
    expect(h.doc.paragraphs()[1]!.localId).toBe(local);
    const before = h.text;
    const gen = h.doc.editGeneration;
    expect(h.doc.setBlockId(local, "n1")).toBe(true);
    expect(h.text).toBe(before);
    expect(ids(h)).toEqual(["a", "n1", "b"]);
    expect(h.doc.editGeneration).toBe(gen);
  });

  it("an id the engine stamped survives undo and redo of the Enter", () => {
    const h = new PMHost([block("a", "A")]);
    h.enter();
    const local = h.doc.paragraphs()[1]!.localId;
    h.doc.setBlockId(local, "n1");
    h.undo();
    expect(h.doc.paragraphs()).toHaveLength(1);
    h.key("y", { ctrl: true });
    expect(ids(h)).toEqual(["a", "n1"]);
  });

  it("Backspace merge keeps the first id; multi-line paste makes unique new ones", () => {
    const h = new PMHost([block("a", "Hello"), block("b", "World")]);
    h.caret(1, 0);
    h.backspace();
    expect(contents(h)).toEqual(["HelloWorld"]);
    expect(ids(h)).toEqual(["a"]);
    const p = new PMHost([block("a", "A"), block("b", "B")]);
    p.caret(1, 0);
    p.paste("x\ny\nz\n");
    expect(contents(p)).toEqual(["A", "x", "y", "z", "B"]);
    expect(ids(p)).toEqual(["a", null, null, null, "b"]);
    expect(new Set(p.doc.paragraphs().map((x) => x.localId)).size).toBe(5);
  });

  it("typing into an empty last line keeps its id; deleting the line above keeps it too", () => {
    const h = new PMHost([block("a", "A"), block("e", "")]);
    h.caretAtEnd();
    h.type("x");
    expect(ids(h)).toEqual(["a", "e"]);
    const d = new PMHost([block("a", "A"), block("b", "B"), block("e", "")]);
    d.select(1 + 3, 1 + 3 + 3); // "\nB" through the boundary: delete line b
    d.key("Backspace");
    expect(ids(d)).toEqual(["a", "e"]);
  });

  it("text holds only content; kind and depth are attributes", () => {
    const h = new PMHost([block("a", "one", K.bulleted), block("b", "two", K.bulleted, "a")]);
    expect(h.text).toBe("one\ntwo");
    expect(h.doc.paragraphs().map((p) => p.depth)).toEqual([0, 1]);
  });

  it("a token chip that is deleted is no longer that block; restoring puts it back", () => {
    const token = syncedParagraph({ blockId: "db", kind: K.token("child_database", "Tasks") });
    const prev = [block("a", "A"), token, block("b", "B")];
    const h = new PMHost(prev);
    expect(h.doc.paragraphs()[1]!.kind).toEqual(K.token("child_database", "Tasks"));
    h.caret(2, 0);
    h.select(1 + 3 - 1, 1 + 3 + 2 + 1); // across the chip line into b's start
    h.key("Backspace");
    expect(ids(h).includes("db")).toBe(false);
    h.doc.restoreToken({ blockId: "db", type: "child_database", title: "Tasks" }, 0, "a");
    expect(ids(h)).toContain("db");
    expect(h.doc.paragraphs().find((p) => p.blockId === "db")!.kind.t).toBe("token");
  });

  it("typing next to a chip is rejected; replacing the whole line makes a fresh paragraph", () => {
    const token = syncedParagraph({ blockId: "db", kind: K.token("child_database", "Tasks") });
    const h = new PMHost([block("a", "A"), token]);
    h.caret(1, 1);
    h.type("x");
    expect(h.doc.paragraphs()[1]!.kind.t).toBe("token");
    h.select(1 + 3, 1 + 4);
    h.type("x");
    const p = h.doc.paragraphs()[1]!;
    expect(p.kind).toEqual(K.paragraph);
    expect(p.blockId).toBeNull();
  });

  it("code block is one paragraph; soft breaks inside it don't split it", () => {
    const h = new PMHost([block("k", "a\nb", K.code("swift"))]);
    h.caretAtEnd();
    h.key("Enter", { shift: true });
    h.type("c");
    expect(h.doc.paragraphs()).toHaveLength(1);
    expect(h.doc.paragraphs()[0]!.content).toBe("a\nb\nc");
    expect(ids(h)).toEqual(["k"]);
  });

  it("select all + type: one paragraph keeps the first id", () => {
    const h = new PMHost([block("a", "A"), block("b", "B"), block("c", "C")]);
    h.select(1, h.state.doc.content.size - 1);
    h.type("x");
    expect(contents(h)).toEqual(["x"]);
    expect(ids(h)).toEqual(["a"]);
  });

  it("load rebuilds, keeps the caret by block id and clears history", () => {
    const h = new PMHost([block("a", "Hello")]);
    h.caret(0, 3);
    h.type("!");
    h.doc.load([block("z", "new"), block("a", "Hello!")], true);
    expect(h.state.selection.$from.parent.attrs["blockId"]).toBe("a");
    expect(h.state.selection.$from.parentOffset).toBe(4);
    h.undo();
    expect(h.text).toBe("new\nHello!");
  });
});
