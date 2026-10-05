import { describe, expect, it } from "vitest";
import { blockShortcutKind, inlineMatch } from "./inputShortcuts";
import { exportMarkdown, importBlocks } from "./markdownImport";
import { numbers } from "./listNumbering";
import { K, kindEquals, type ParagraphKind } from "./paragraphKind";
import { span } from "../notion/richText";

/** Pure parts of WYSIWYGTests; the text-level typing/Enter/Backspace cases run against ProseMirror in M5b. */
describe("WYSIWYG: block shortcuts (pure)", () => {
  const table: [string, ParagraphKind][] = [
    ["# ", K.heading1], ["## ", K.heading2], ["### ", K.heading3], ["- ", K.bulleted], ["* ", K.bulleted],
    ["1. ", K.numbered], ["[] ", K.toDo(false)], ["[ ] ", K.toDo(false)], ["[x] ", K.toDo(true)],
    ["> ", K.quote], ["+ ", K.toggle], ["!> ", K.callout("💡")], ["```", K.code("plain text")],
  ];
  it.each(table)("typing a shortcut at a line start converts it: %j", (shortcut, kind) => {
    const got = blockShortcutKind(shortcut, K.paragraph);
    expect(got && kindEquals(got, kind)).toBe(true);
  });

  it("\"- [ ] \" goes bullet then to-do; shortcuts only fire on plain paragraphs", () => {
    expect(blockShortcutKind("- ", K.paragraph)).toEqual(K.bulleted);
    expect(blockShortcutKind("[ ] ", K.bulleted)).toEqual(K.toDo(false));
    expect(blockShortcutKind("# ", K.bulleted)).toBeNull();
    expect(blockShortcutKind("# ", K.heading1)).toBeNull();
    expect(blockShortcutKind("a# ", K.paragraph)).toBeNull();
    expect(blockShortcutKind("1234. ", K.paragraph)).toBeNull();
  });
});

describe("WYSIWYG: inline formatting (pure)", () => {
  const cases: [string, string, "bold" | "italic" | "strikethrough" | "code" | "link"][] = [
    ["say **bold**", "bold", "bold"], ["say *it*", "it", "italic"], ["say _it_", "it", "italic"],
    ["say ~~gone~~", "gone", "strikethrough"], ["say `x = 1`", "x = 1", "code"], ["say [site](https://example.com)", "site", "link"],
  ];
  it.each(cases)("closing marker converts the run: %s", (typed, inner, style) => {
    const m = inlineMatch(typed);
    expect(m?.style.t).toBe(style);
    expect(typed.slice(m!.inner[0], m!.inner[1])).toBe(inner);
    expect(m!.whole[1]).toBe(typed.length);
  });

  it("a link without a scheme gets https://", () => {
    expect(inlineMatch("[a](example.com)")?.style).toEqual({ t: "link", url: "https://example.com" });
    expect(inlineMatch("[a](nodots)")).toBeNull();
  });

  it.each(["2 * 3", "snake_case_name", "a ** b", "a * x*", "``", "[x](y z)"])("unmatched or empty markers are left alone: %s", (typed) => {
    for (let i = 1; i <= typed.length; i++) expect(inlineMatch(typed.slice(0, i))).toBeNull();
  });
});

describe("WYSIWYG: numbering, paste, copy (pure)", () => {
  it("numbered lists renumber in runs, nested levels included", () => {
    const items = [[K.numbered, 0], [K.numbered, 0], [K.numbered, 1], [K.numbered, 1], [K.numbered, 0], [K.paragraph, 0], [K.numbered, 0]] as const;
    expect(numbers(items.map(([kind, depth]) => ({ kind, depth })))).toEqual([1, 2, 1, 2, 3, null, 1]);
  });

  it("pasting Markdown makes blocks and formatting; copying gives Markdown back", () => {
    const md = "# Title\n- one\n  - nested\n- [ ] task\nplain **bold**";
    const blocks = importBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual([K.heading1, K.bulleted, K.bulleted, K.toDo(false), K.paragraph]);
    expect(blocks.map((b) => b.depth)).toEqual([0, 0, 1, 0, 0]);
    expect(blocks[4]!.spans).toEqual([span("plain "), span("bold", { bold: true })]);
    expect(exportMarkdown(blocks)).toBe(md);
  });

  it("copy writes tokens as their title and images as markdown images", () => {
    expect(exportMarkdown([
      { kind: K.token("child_database", "Tasks"), depth: 0, spans: [] },
      { kind: K.image("external:https://x.y/a.png"), depth: 1, spans: [] },
      { kind: K.code("js"), depth: 0, spans: [span("a")] },
    ])).toBe("Tasks\n  ![image](https://x.y/a.png)\n```\na\n```");
  });
});
