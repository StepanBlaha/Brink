import { describe, expect, it } from "vitest";
import { K, type ParagraphKind } from "../domain/markdown/paragraphKind";
import { span } from "../domain/notion/richText";
import { plan } from "../domain/editor/syncPlanner";
import { block, PMHost } from "../test/pmHost";

describe("block shortcuts", () => {
  const cases: [string, ParagraphKind][] = [
    ["# ", K.heading1], ["## ", K.heading2], ["### ", K.heading3], ["- ", K.bulleted], ["* ", K.bulleted],
    ["1. ", K.numbered], ["[] ", K.toDo(false)], ["[ ] ", K.toDo(false)], ["[x] ", K.toDo(true)],
    ["> ", K.quote], ["+ ", K.toggle], ["!> ", K.callout("💡")], ["```", K.code("plain text")],
  ];
  it.each(cases)("typing %j converts and removes the marker; undo restores it", (shortcut, kind) => {
    const h = new PMHost([block("e", "")]);
    h.type(shortcut);
    expect(h.text).toBe("");
    expect(h.kinds).toEqual([kind]);
    expect(h.ids).toEqual(["e"]);
    h.type("x");
    expect(h.text).toBe("x");
    expect(h.kinds).toEqual([kind]);
    const f = new PMHost([block("e", "")]);
    f.type(shortcut);
    f.undo();
    expect(f.text).toBe(shortcut);
    expect(f.kinds).toEqual([K.paragraph]);
  });

  it("'- [ ] ' goes bullet to to-do; shortcuts only fire at the line start", () => {
    const h = new PMHost([block("e", "")]);
    h.type("- [ ] task");
    expect(h.text).toBe("task");
    expect(h.kinds).toEqual([K.toDo(false)]);
    const mid = new PMHost([block("a", "a")]);
    mid.type("# ");
    expect(mid.text).toBe("a# ");
    expect(mid.kinds).toEqual([K.paragraph]);
  });

  it("'---' + Enter makes a divider with a new line below", () => {
    const h = new PMHost([block("e", "")]);
    h.type("---");
    h.enter();
    expect(h.kinds).toEqual([K.divider, K.paragraph]);
    expect(h.text).toBe("\n");
  });
});

describe("inline formatting", () => {
  const cases: [string, string, Parameters<typeof span>[1]][] = [
    ["**bold**", "bold", { bold: true }], ["*it*", "it", { italic: true }], ["_it_", "it", { italic: true }],
    ["~~gone~~", "gone", { strikethrough: true }], ["`x = 1`", "x = 1", { code: true }],
    ["[site](https://example.com)", "site", { link: "https://example.com" }],
  ];
  it.each(cases)("%s becomes an attribute", (typed, text, o) => {
    const h = new PMHost([block("a", "")]);
    h.type("say " + typed);
    expect(h.text).toBe("say " + text);
    expect(h.doc.paragraphs()[0]!.spans).toEqual([span("say "), span(text, o)]);
    h.type("!");
    expect(h.doc.paragraphs()[0]!.spans.at(-1)).toEqual(span("!"));
  });

  it.each(["2 * 3", "snake_case_name", "a ** b", "a * x*", "``", "[x](y z)"])("%j stays literal", (typed) => {
    const h = new PMHost([block("a", "")]);
    h.type(typed);
    expect(h.text).toBe(typed);
    expect(h.doc.paragraphs()[0]!.spans).toEqual([span(typed)]);
  });

  it("Ctrl+B on a selection makes a bold run the planner sends as annotated text", () => {
    const h = new PMHost([block("p", "plain")]);
    h.select(3, 6);
    h.key("b", { ctrl: true });
    const p = h.doc.paragraphs()[0]!;
    expect(p.spans).toEqual([span("pl"), span("ain", { bold: true })]);
    expect(plan([block("p", "plain")], [p])).toEqual([{ t: "update", blockId: "p", kind: K.paragraph, content: "pl**ain**" }]);
    h.key("b", { ctrl: true });
    expect(h.doc.paragraphs()[0]!.spans).toEqual([span("plain")]);
  });
});
