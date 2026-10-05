import { describe, expect, it } from "vitest";
import type { Block } from "../notion/block";
import { span, type RichTextSpan } from "../notion/richText";
import { blocks, spans } from "./markdownParser";
import { markdown, markdownForBlock, prefixFor } from "./markdownSerializer";

describe("MarkdownSerializer", () => {
  it("serializes a plain span", () => expect(markdown([span("hello")])).toBe("hello"));
  it("serializes bold, italic, strikethrough, code, link", () => {
    expect(markdown([span("b", { bold: true })])).toBe("**b**");
    expect(markdown([span("i", { italic: true })])).toBe("*i*");
    expect(markdown([span("s", { strikethrough: true })])).toBe("~~s~~");
    expect(markdown([span("c", { code: true })])).toBe("`c`");
    expect(markdown([span("n", { link: "https://notion.so" })])).toBe("[n](https://notion.so)");
  });
  it("bold+italic serializes with the combined marker", () => {
    expect(markdown([span("x", { bold: true, italic: true })])).toBe("***x***");
  });
  it("block prefixes", () => {
    expect(prefixFor({ kind: "heading1" })).toBe("# ");
    expect(prefixFor({ kind: "heading2" })).toBe("## ");
    expect(prefixFor({ kind: "heading3" })).toBe("### ");
    expect(prefixFor({ kind: "bulletedListItem" })).toBe("- ");
    expect(prefixFor({ kind: "numberedListItem" })).toBe("1. ");
    expect(prefixFor({ kind: "quote" })).toBe("> ");
    expect(prefixFor({ kind: "toDo", checked: false })).toBe("- [ ] ");
    expect(prefixFor({ kind: "toDo", checked: true })).toBe("- [x] ");
    expect(prefixFor({ kind: "paragraph" })).toBe("");
  });
  it("markdown(for:) combines prefix and inline spans", () => {
    const block: Block = { id: "1", type: { kind: "toDo", checked: true }, hasChildren: false, richText: [span("buy milk", { bold: true })] };
    expect(markdownForBlock(block)).toBe("- [x] **buy milk**");
  });
  const trip = (original: RichTextSpan[]): void => expect(spans(markdown(original))).toEqual(original);
  it("round trip: mixed formatting", () => {
    trip([span("plain "), span("bold", { bold: true }), span(" and "), span("italic", { italic: true }), span(" and "),
      span("code", { code: true }), span(" and "), span("gone", { strikethrough: true })]);
  });
  it("round trip: bold+italic", () => trip([span("both", { bold: true, italic: true })]));
  it("round trip: link", () => trip([span("Notion", { link: "https://notion.so" })]));
  it("round trip: plain text with no annotations", () => trip([span("just some words")]));
  it("round trip: block-level to-do with inline formatting", () => {
    const rich = [span("call "), span("mom", { bold: true })];
    const block: Block = { id: "1", type: { kind: "toDo", checked: false }, hasChildren: false, richText: rich };
    const md = markdownForBlock(block);
    expect(md).toBe("- [ ] call **mom**");
    expect(blocks(md)).toEqual([{ kind: "formatted", blockKind: "toDo", richText: rich, language: "plain text", checked: false }]);
  });
});
