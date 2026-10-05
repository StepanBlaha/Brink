import { describe, expect, it } from "vitest";
import { K } from "../domain/markdown/paragraphKind";
import { numbers } from "../domain/markdown/listNumbering";
import { span } from "../domain/notion/richText";
import { plan } from "../domain/editor/syncPlanner";
import { block, PMHost } from "../test/pmHost";

describe("Notion keys", () => {
  it("Backspace at the start converts to text first, then merges", () => {
    const h = new PMHost([block("a", "A"), block("b", "B", K.bulleted)]);
    h.caret(1, 0);
    h.backspace();
    expect(h.kinds).toEqual([K.paragraph, K.paragraph]);
    expect(h.text).toBe("A\nB");
    h.backspace();
    expect(h.text).toBe("AB");
    expect(h.ids).toEqual(["a"]);
  });

  it("Backspace outdents, deletes a divider above, swallows a token above", () => {
    const d = new PMHost([block("a", "A"), block("b", "B", K.paragraph, "a")]);
    expect(d.doc.paragraphs()[1]!.depth).toBe(1);
    d.caret(1, 0);
    d.backspace();
    expect(d.doc.paragraphs()[1]!.depth).toBe(0);
    const dv = new PMHost([block("a", "A"), block("v", "", K.divider), block("b", "B")]);
    dv.caret(2, 0);
    dv.backspace();
    expect(dv.kinds).toEqual([K.paragraph, K.paragraph]);
    expect(dv.ids).toEqual(["a", "b"]);
    const tk = new PMHost([block("a", "A", K.token("child_page", "P")), block("b", "B")]);
    tk.caret(1, 0);
    tk.backspace();
    expect(tk.text).toBe("￼\nB");
  });

  it("Enter continues lists; an empty item leaves the list; headings end in text", () => {
    const h = new PMHost([block("a", "one", K.bulleted)]);
    h.enter();
    h.type("two");
    expect(h.text).toBe("one\ntwo");
    expect(h.kinds).toEqual([K.bulleted, K.bulleted]);
    h.enter();
    h.enter();
    expect(h.kinds).toEqual([K.bulleted, K.bulleted, K.paragraph]);
    const todo = new PMHost([block("t", "done", K.toDo(true))]);
    todo.enter();
    expect(todo.kinds).toEqual([K.toDo(true), K.toDo(false)]);
    const heading = new PMHost([block("h", "Title", K.heading1)]);
    heading.enter();
    expect(heading.kinds).toEqual([K.heading1, K.paragraph]);
    const mid = new PMHost([block("n", "onetwo", K.numbered)]);
    mid.caret(0, 3);
    mid.enter();
    expect(mid.text).toBe("one\ntwo");
    expect(mid.kinds).toEqual([K.numbered, K.numbered]);
    expect(mid.ids).toEqual(["n", null]);
  });

  it("Enter at 0 puts an empty block above; at the end of an open toggle makes a child; code keeps lines", () => {
    const h = new PMHost([block("a", "Hello")]);
    h.caret(0, 0);
    h.enter();
    expect(h.ids).toEqual([null, "a"]);
    const t = new PMHost([block("t", "Tog", K.toggle)]);
    t.enter();
    expect(t.kinds).toEqual([K.toggle, K.paragraph]);
    expect(t.doc.paragraphs().map((p) => p.depth)).toEqual([0, 1]);
    const c = new PMHost([block("k", "a", K.code("swift"))]);
    c.enter();
    c.enter();
    expect(c.kinds).toEqual([K.code("swift"), K.paragraph]);
    expect(c.doc.paragraphs()[0]!.content).toBe("a");
    const s = new PMHost([block("p", "ab")]);
    s.caret(0, 1);
    s.key("Enter", { shift: true });
    expect(s.doc.paragraphs()).toHaveLength(1);
    expect(s.doc.paragraphs()[0]!.spans[0]!.text).toBe("a\nb");
  });

  it("Tab and Shift+Tab change depth (max 3, not deeper than previous + 1)", () => {
    const h = new PMHost([block("a", "A"), block("b", "B")]);
    h.caret(1, 0);
    h.key("Tab");
    h.key("Tab");
    expect(h.doc.paragraphs().map((p) => p.depth)).toEqual([0, 1]);
    h.key("Tab", { shift: true });
    expect(h.doc.paragraphs().map((p) => p.depth)).toEqual([0, 0]);
    h.caret(0, 0);
    h.key("Tab");
    expect(h.doc.paragraphs()[0]!.depth).toBe(0);
    const c = new PMHost([block("k", "x", K.code("swift"))]);
    c.caret(0, 0);
    c.key("Tab");
    expect(c.text).toBe("\tx");
  });

  it("checking a to-do and editing a heading become in-place updates", () => {
    const previous = [block("h", "Title", K.heading1), block("t", "task", K.toDo(false))];
    const h = new PMHost(previous);
    h.caret(0, 5);
    h.type("!");
    const el = h.view.dom.querySelectorAll(".gut.check")[0] as HTMLElement;
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(plan(previous, h.doc.paragraphs())).toEqual([
      { t: "update", blockId: "h", kind: K.heading1, content: "Title!" },
      { t: "update", blockId: "t", kind: K.toDo(true), content: "task" },
    ]);
  });
});

describe("numbering, paste, copy", () => {
  it("numbered lists renumber in runs", () => {
    const items = [[0], [0], [1], [1], [0]].map(([d]) => ({ kind: K.numbered, depth: d! }));
    expect(numbers([...items, { kind: K.paragraph, depth: 0 }, { kind: K.numbered, depth: 0 }])).toEqual([1, 2, 1, 2, 3, null, 1]);
  });

  it("pasting Markdown makes blocks; copying gives Markdown back", () => {
    const h = new PMHost([block("e", "")]);
    const md = "# Title\n- one\n  - nested\n- [ ] task\nplain **bold**";
    h.paste(md);
    expect(h.text).toBe("Title\none\nnested\ntask\nplain bold");
    const ps = h.doc.paragraphs();
    expect(ps.map((p) => p.kind)).toEqual([K.heading1, K.bulleted, K.bulleted, K.toDo(false), K.paragraph]);
    expect(ps.map((p) => p.depth)).toEqual([0, 0, 1, 0, 0]);
    expect(ps[0]!.blockId).toBe("e");
    expect(ps.at(-1)!.spans).toEqual([span("plain "), span("bold", { bold: true })]);
    expect(h.copyText()).toBe(md);
  });

  it("paste mid-line joins the first line and keeps the tail after the last", () => {
    const h = new PMHost([block("a", "AB")]);
    h.caret(0, 1);
    h.paste("x\ny");
    expect(h.text).toBe("Ax\nyB");
    expect(h.ids).toEqual(["a", null]);
  });
});
