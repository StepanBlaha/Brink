import { describe, expect, it } from "vitest";
import { K } from "../domain/markdown/paragraphKind";
import { PageEditorEngine } from "../domain/editor/engine";
import { FakeNotionServer } from "../test/fakeNotion";
import { seedPage } from "../domain/editor/engineHarness";
import { block, PMHost } from "../test/pmHost";
import { slashKey, slashMatches } from "./plugins/slash";
import { createBrinkDoc } from "./setup";

const slash = (h: PMHost) => slashKey.getState(h.state)!;

describe("slash menu", () => {
  it("opens on '/', filters fuzzily, wraps with arrows, Enter applies and removes '/query'", () => {
    const h = new PMHost([block("e", "")]);
    h.type("/");
    expect(slash(h).open).toBe(true);
    expect(slashMatches(slash(h))).toHaveLength(12);
    h.type("to");
    expect(slashMatches(slash(h)).slice(0, 2)).toEqual(["toDo", "toggle"]);
    h.key("ArrowDown");
    expect(slash(h).index).toBe(1);
    h.key("ArrowDown");
    expect(slash(h).index).toBe(0);
    h.key("Enter");
    expect(h.text).toBe("");
    expect(h.kinds).toEqual([K.toDo(false)]);
    expect(slash(h).open).toBe(false);
  });

  it("Esc closes and keeps the text; '/' after a word does not open; no matches + space closes", () => {
    const h = new PMHost([block("e", "")]);
    h.type("/he");
    h.key("Escape");
    expect(slash(h).open).toBe(false);
    expect(h.text).toBe("/he");
    const w = new PMHost([block("e", "")]);
    w.type("a/");
    expect(slash(w).open).toBe(false);
    const n = new PMHost([block("e", "")]);
    n.type("/zzz");
    expect(slash(n).open).toBe(true);
    expect(slashMatches(slash(n))).toEqual([]);
    n.type(" ");
    expect(slash(n).open).toBe(false);
  });

  it("does not open in code; closes when the caret leaves or '/' is deleted", () => {
    const c = new PMHost([block("k", "", K.code("swift"))]);
    c.type("/");
    expect(slash(c).open).toBe(false);
    const h = new PMHost([block("a", "x "), block("b", "")]);
    h.caret(0, 2);
    h.type("/h");
    expect(slash(h).open).toBe(true);
    h.caret(1, 0);
    expect(slash(h).open).toBe(false);
    h.caret(0, 4);
    h.type("/");
    h.backspace();
    expect(slash(h).open).toBe(false);
  });

  it("divider: empty line becomes divider + paragraph; with text keeps it and adds both below; callout keeps its icon", () => {
    const e = new PMHost([block("e", "")]);
    e.type("/divider");
    e.key("Enter");
    expect(e.kinds).toEqual([K.divider, K.paragraph]);
    const t = new PMHost([block("a", "Hi ")]);
    t.type("/line");
    t.key("Enter");
    expect(t.kinds).toEqual([K.paragraph, K.divider, K.paragraph]);
    expect(t.text).toBe("Hi \n\n");
    const c = new PMHost([block("c", "", K.callout("🔥"))]);
    c.type("/callout");
    c.key("Enter");
    expect(c.kinds).toEqual([K.callout("🔥")]);
  });
});

describe("toggles and callouts", () => {
  it("collapse hides deeper blocks locally without counting as an edit", () => {
    const h = new PMHost([block("t", "T", K.toggle), block("c", "child", K.paragraph, "t"), block("n", "next")]);
    const gen = h.doc.editGeneration;
    const arrow = h.view.dom.querySelector(".gut.arrow") as HTMLElement;
    arrow.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    const hidden = [...h.view.dom.querySelectorAll(".blk")].map((e) => e.classList.contains("hidden"));
    expect(hidden).toEqual([false, true, false]);
    expect(h.doc.editGeneration).toBe(gen);
    expect(h.doc.paragraphs()).toHaveLength(3);
    expect(h.view.dom.querySelector(".gut.arrow")!.textContent).toBe("▸");
  });

  it("Enter after a callout continues with a paragraph; the icon is drawn as a gutter widget", () => {
    const h = new PMHost([block("c", "Note", K.callout("💡"))]);
    h.enter();
    expect(h.kinds).toEqual([K.callout("💡"), K.paragraph]);
    expect(h.view.dom.querySelector(".gut.icon")!.textContent).toBe("💡");
  });

  it("gutter markers are widgets, never text", () => {
    const h = new PMHost([block("a", "one", K.bulleted), block("b", "two", K.numbered), block("c", "q", K.quote)]);
    expect(h.text).toBe("one\ntwo\nq");
    expect(h.view.dom.querySelector(".gut.bullet")!.textContent).toBe("•");
    expect(h.view.dom.querySelector(".gut.num")!.textContent).toBe("1.");
  });
});

describe("engine on the ProseMirror document", () => {
  it("editsAreSaved: the exact requests from real editor edits", async () => {
    const server = new FakeNotionServer();
    seedPage(server);
    const doc = createBrinkDoc();
    const engine = new PageEditorEngine({ pageId: "page-1", api: server.api(), doc, debounceMs: 700, remoteQuietPeriodMs: 0, retryIntervalMs: 600_000 });
    await engine.load();
    expect(doc.paragraphs().map((p) => p.blockId)).toEqual(["h", "p1", "e1", "t1", "db", "b1", "c1", "p5", "e2"]);
    server.clearLog();
    const at = (i: number, off: number) => {
      let pos = 0;
      for (let k = 0; k < i; k++) pos += doc.state.doc.child(k).nodeSize;
      return pos + 1 + off;
    };
    const tx = (f: (tr: ReturnType<typeof doc.state.tr.insertText>) => unknown) => doc.dispatch(f(doc.state.tr) as never);
    tx((tr) => tr.insertText(" brave", at(1, 5)));
    doc.dispatch(doc.state.tr.split(at(1, 17), 1, [{ type: doc.state.doc.type.schema.nodes["block"]!, attrs: { localId: "L-new", blockId: null, kind: "paragraph", depth: 0, collapsed: false } }]));
    doc.dispatch(doc.state.tr.insertText("New line", at(2, 0)));
    doc.dispatch(doc.state.tr.setNodeAttribute(at(4, 0) - 1, "kind", "to_do:checked"));
    const p5 = at(8, 0) - 1;
    doc.dispatch(doc.state.tr.delete(p5, p5 + doc.state.doc.child(8).nodeSize));
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual([
      "PATCH /v1/blocks/p1", "PATCH /v1/blocks/page-1/children", "PATCH /v1/blocks/t1", "DELETE /v1/blocks/p5",
    ]);
    expect(doc.paragraphs().map((p) => p.blockId)).toEqual(["h", "p1", "new-1", "e1", "t1", "db", "b1", "c1", "e2"]);
  });
});
