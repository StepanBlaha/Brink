import { describe, expect, it } from "vitest";
import { K } from "../markdown/paragraphKind";
import { d, s, unchanged, withContent } from "./plannerHelpers";
import { plan } from "./syncPlanner";

const base = [s("a", "Alpha"), s("b", "Hello world"), s("c", "Gamma")];

describe("EditorSyncPlanner: exact identity ops", () => {
  it("noChanges", () => expect(plan(base, unchanged(base))).toEqual([]));

  it("editing one character in the middle is a single update", () => {
    const current = unchanged(base);
    current[1] = withContent(current[1]!, "Hello, world");
    expect(plan(base, current)).toEqual([{ t: "update", blockId: "b", kind: K.paragraph, content: "Hello, world" }]);
  });

  it("Enter at the end of a line is one insert after that block", () => {
    const current = unchanged(base);
    const n = d(null, "", K.paragraph, { local: "n1" });
    current.splice(2, 0, n);
    expect(plan(base, current)).toEqual([{ t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "b" }, paragraphs: [n] }]);
  });

  it("Enter mid-line is an update of the first half plus an insert of the second half", () => {
    const current = unchanged(base);
    current[1] = withContent(current[1]!, "Hello");
    const second = d(null, " world", K.paragraph, { local: "n1" });
    current.splice(2, 0, second);
    expect(plan(base, current)).toEqual([
      { t: "update", blockId: "b", kind: K.paragraph, content: "Hello" },
      { t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "b" }, paragraphs: [second] },
    ]);
  });

  it("an empty line is an empty paragraph block: inserted, and kept when unchanged", () => {
    const current = unchanged(base);
    const empty = d(null, "", K.paragraph, { local: "e1" });
    current.splice(1, 0, empty);
    expect(plan(base, current)).toEqual([{ t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "a" }, paragraphs: [empty] }]);
    const withEmpties = [s("a", "A"), s("e1", ""), s("e2", ""), s("b", "B"), s("e3", "")];
    expect(plan(withEmpties, unchanged(withEmpties))).toEqual([]);
  });

  it("deleting a line is one delete", () => {
    const current = unchanged(base);
    current.splice(1, 1);
    expect(plan(base, current)).toEqual([{ t: "delete", blockId: "b" }]);
  });

  it("merging two lines (Backspace at line start) is update + delete", () => {
    const current = unchanged(base);
    current[1] = withContent(current[1]!, "Hello worldGamma");
    current.splice(2, 1);
    expect(plan(base, current)).toEqual([
      { t: "update", blockId: "b", kind: K.paragraph, content: "Hello worldGamma" },
      { t: "delete", blockId: "c" },
    ]);
  });

  it("pasting 3 lines is one batched insert at the right position", () => {
    const current = unchanged(base);
    const pasted = [d(null, "one", K.paragraph, { local: "p1" }), d(null, "two", K.bulleted, { local: "p2" }), d(null, "three", K.paragraph, { local: "p3" })];
    current.splice(1, 0, ...pasted);
    expect(plan(base, current)).toEqual([{ t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "a" }, paragraphs: pasted }]);
  });

  it("inserts at the very top use position start; > 100 new blocks are split into batches", () => {
    const prev = [s("a", "A")];
    const created = Array.from({ length: 150 }, (_, i) => d(null, `line ${i}`, K.paragraph, { local: `n${i}` }));
    const ops = plan(prev, [...created, ...unchanged(prev)]);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({ t: "insert", parent: { t: "page" }, position: { t: "start" }, paragraphs: created.slice(0, 100) });
    expect(ops[1]).toEqual({ t: "insert", parent: { t: "page" }, position: { t: "afterPending", localId: "n99" }, paragraphs: created.slice(100) });
  });

  it("kind change Notion cannot do in place is insert new + delete old", () => {
    const current = [d("a", "foo", K.heading1, { local: "La" })];
    expect(plan([s("a", "foo")], current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "start" }, paragraphs: current },
      { t: "delete", blockId: "a" },
    ]);
  });

  it("checking a to-do / changing code language are in-place updates", () => {
    const prev = [s("t", "task", K.toDo(false)), s("k", "let x = 1", K.code("plain text"))];
    const current = [d("t", "task", K.toDo(true)), d("k", "let x = 1", K.code("swift"))];
    expect(plan(prev, current)).toEqual([
      { t: "update", blockId: "t", kind: K.toDo(true), content: "task" },
      { t: "update", blockId: "k", kind: K.code("swift"), content: "let x = 1" },
    ]);
  });

  it("indenting a line recreates it as a child of the paragraph above", () => {
    const prev = [s("a", "one", K.bulleted), s("b", "two", K.bulleted)];
    const current = [d("a", "one", K.bulleted), d("b", "two", K.bulleted, { depth: 1, local: "Lb" })];
    expect(plan(prev, current)).toEqual([
      { t: "insert", parent: { t: "block", id: "a" }, position: { t: "start" }, paragraphs: [current[1]] },
      { t: "delete", blockId: "b" },
    ]);
  });

  it("outdenting a child recreates it at the parent's level after it", () => {
    const prev = [s("a", "one", K.bulleted), s("b", "two", K.bulleted, { parent: "a" }), s("c", "three")];
    const current = [d("a", "one", K.bulleted), d("b", "two", K.bulleted, { local: "Lb" }), d("c", "three")];
    expect(plan(prev, current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "a" }, paragraphs: [current[1]] },
      { t: "delete", blockId: "b" },
    ]);
  });

  it("a recreated parent takes its children along; only the top-most old block is deleted", () => {
    const prev = [s("a", "one"), s("b", "child", K.bulleted, { parent: "a" })];
    const current = [d("a", "one", K.quote, { local: "La" }), d("b", "child", K.bulleted, { depth: 1, local: "Lb" })];
    expect(plan(prev, current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "start" }, paragraphs: [current[0]] },
      { t: "insert", parent: { t: "pending", localId: "La" }, position: { t: "start" }, paragraphs: [current[1]] },
      { t: "delete", blockId: "a" },
    ]);
  });

  it("a deleted token paragraph has no delete op, the token is restored in place", () => {
    const token = s("db", "", K.token("child_database", "Tasks"));
    expect(plan([s("a", "A"), token, s("b", "B")], [d("a", "A"), d("b", "B")])).toEqual([
      { t: "restoreToken", token, depth: 0, afterBlockId: "a" },
    ]);
  });

  it("a token that is still present is left alone, as are its neighbors", () => {
    const prev = [s("a", "A"), s("db", "", K.token("child_database", "Tasks")), s("b", "B")];
    expect(plan(prev, unchanged(prev))).toEqual([]);
  });

  it("an id the server does not know is inserted as new", () => {
    const current = [d("a", "A"), d("zombie", "back", K.paragraph, { local: "Lz" })];
    expect(plan([s("a", "A")], current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "a" }, paragraphs: [current[1]] },
    ]);
  });

  it("a line moved above others recreates only the moved block", () => {
    const prev = [s("a", "A"), s("b", "B"), s("c", "C"), s("d", "D")];
    const current = [d("d", "D", K.paragraph, { local: "Ld" }), d("a", "A"), d("b", "B"), d("c", "C")];
    expect(plan(prev, current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "start" }, paragraphs: [current[0]] },
      { t: "delete", blockId: "d" },
    ]);
  });

  it("blocks with hidden children are never recreated", () => {
    expect(plan([s("a", "deep", K.bulleted, { hidden: true })], [d("a", "deep", K.heading1)])).toEqual([]);
  });

  it("underline and color changes are updates (kept, PORT 9.12)", () => {
    const prev = [s("a", "x")];
    const cur = [{ ...d("a", "x"), content: "x\u0000u", spans: [{ text: "x", bold: false, italic: false, strikethrough: false, code: false, underline: true }] }];
    expect(plan(prev, cur)).toEqual([{ t: "update", blockId: "a", kind: K.paragraph, content: "x\u0000u" }]);
  });
});
