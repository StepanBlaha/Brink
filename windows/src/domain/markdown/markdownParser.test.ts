import { describe, expect, it } from "vitest";
import type { NewBlock, NewBlockKind } from "../notion/newBlock";
import { span } from "../notion/richText";
import { blocks, detectPrefixedBlock, spans } from "./markdownParser";

const f = (blockKind: NewBlockKind, text: string, o: { language?: string; checked?: boolean } = {}): NewBlock => ({
  kind: "formatted", blockKind, richText: text === "" ? [] : [span(text)], language: o.language ?? "plain text", checked: o.checked ?? false,
});

describe("MarkdownParser blocks", () => {
  it("headings", () => {
    expect(blocks("# H1\n## H2\n### H3")).toEqual([f("heading1", "H1"), f("heading2", "H2"), f("heading3", "H3")]);
  });
  it("bulleted list with -, *, +", () => {
    const b = blocks("- one\n* two\n+ three");
    expect(b).toHaveLength(3);
    expect(b.every((x) => x.kind === "formatted" && x.blockKind === "bulletedListItem")).toBe(true);
  });
  it("numbered list ignores the actual digit", () => {
    expect(blocks("1. one\n7. seven")).toEqual([f("numberedListItem", "one"), f("numberedListItem", "seven")]);
  });
  it("to-do unchecked variants", () => {
    for (const line of ["[ ] a", "[] a", "- [ ] a"]) expect(blocks(line)).toEqual([f("toDo", "a", { checked: false })]);
  });
  it("to-do checked variants", () => {
    for (const line of ["[x] a", "- [x] a"]) expect(blocks(line)).toEqual([f("toDo", "a", { checked: true })]);
  });
  it("quote", () => {
    expect(blocks("> a wise quote")).toEqual([f("quote", "a wise quote")]);
  });
  it("fenced code block with language", () => {
    expect(blocks("```swift\nlet x = 1\nlet y = 2\n```")).toEqual([f("code", "let x = 1\nlet y = 2", { language: "swift" })]);
  });
  it("fenced code block with no language", () => {
    expect(blocks("```\nbare\n```")).toEqual([f("code", "bare", { language: "plain text" })]);
  });
  it("divider", () => {
    expect(blocks("---")).toEqual([f("divider", "")]);
  });
  it("blank lines separate blocks without producing empty ones", () => {
    expect(blocks("first\n\nsecond\n\n\nthird")).toEqual([f("paragraph", "first"), f("paragraph", "second"), f("paragraph", "third")]);
  });
  it("plain text becomes a paragraph", () => {
    expect(blocks("just some text")).toEqual([f("paragraph", "just some text")]);
  });
  it("multi-line input mixes block types", () => {
    expect(blocks("# Title\n- [ ] todo\nparagraph text")).toEqual([
      f("heading1", "Title"), f("toDo", "todo", { checked: false }), f("paragraph", "paragraph text"),
    ]);
  });
  it("detectPrefixedBlock recognizes a conversion prefix", () => {
    expect(detectPrefixedBlock("# Heading")).not.toBeNull();
    expect(detectPrefixedBlock("[] todo")).not.toBeNull();
    expect(detectPrefixedBlock("plain text")).toBeNull();
    expect(detectPrefixedBlock("---")).toBeNull();
    expect(detectPrefixedBlock("```swift")).toBeNull();
  });
});

describe("MarkdownParser inline spans", () => {
  it("plain text with no markers", () => expect(spans("hello world")).toEqual([span("hello world")]));
  it("bold with ** and __", () => {
    expect(spans("**bold**")).toEqual([span("bold", { bold: true })]);
    expect(spans("__bold__")).toEqual([span("bold", { bold: true })]);
  });
  it("italic with * and _", () => {
    expect(spans("*italic*")).toEqual([span("italic", { italic: true })]);
    expect(spans("_italic_")).toEqual([span("italic", { italic: true })]);
  });
  it("strikethrough", () => expect(spans("~~gone~~")).toEqual([span("gone", { strikethrough: true })]));
  it("inline code", () => expect(spans("`let x = 1`")).toEqual([span("let x = 1", { code: true })]));
  it("link", () => expect(spans("[Notion](https://notion.so)")).toEqual([span("Notion", { link: "https://notion.so" })]));
  it("nested bold + italic via ***", () => expect(spans("***both***")).toEqual([span("both", { bold: true, italic: true })]));
  it("mixed plain and formatted runs", () => {
    expect(spans("plain **bold** plain")).toEqual([span("plain "), span("bold", { bold: true }), span(" plain")]);
  });
  it("multiple formatted runs in one line", () => {
    expect(spans("**bold** and *italic* and `code`")).toEqual([
      span("bold", { bold: true }), span(" and "), span("italic", { italic: true }), span(" and "), span("code", { code: true }),
    ]);
  });
  it("unmatched marker stays literal", () => {
    expect(spans("this *has no closing star")).toEqual([span("this *has no closing star")]);
    expect(spans("**unterminated bold")).toEqual([span("**unterminated bold")]);
  });
  it("unmatched code backtick stays literal", () => expect(spans("one ` backtick")).toEqual([span("one ` backtick")]));
  it("empty string yields no spans", () => expect(spans("")).toEqual([]));
  it("bold containing inline code", () => {
    expect(spans("**bold `code` text**")).toEqual([
      span("bold ", { bold: true }), span("code", { bold: true, code: true }), span(" text", { bold: true }),
    ]);
  });
});
