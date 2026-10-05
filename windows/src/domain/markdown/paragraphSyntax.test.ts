import { describe, expect, it } from "vitest";
import { K, kindEquals, type ParagraphKind } from "./paragraphKind";
import { normalizeLanguage, parse, render, sendableLanguage } from "./paragraphSyntax";

describe("ParagraphSyntax: one paragraph is one block", () => {
  const cases: [string, ParagraphKind, string][] = [
    ["# Title", K.heading1, "Title"],
    ["## Sub", K.heading2, "Sub"],
    ["### Small", K.heading3, "Small"],
    ["- item", K.bulleted, "item"],
    ["* item", K.bulleted, "item"],
    ["12. item", K.numbered, "item"],
    ["- [ ] task", K.toDo(false), "task"],
    ["- [x] done", K.toDo(true), "done"],
    ["> quoted", K.quote, "quoted"],
    ["---", K.divider, ""],
    ["plain **bold**", K.paragraph, "plain **bold**"],
    ["", K.paragraph, ""],
  ];
  it.each(cases)("prefixes determine the kind: %s", (text, kind, content) => {
    const parsed = parse(text);
    expect(kindEquals(parsed.kind, kind)).toBe(true);
    expect(parsed.content).toBe(content);
  });

  it("depth: leading tabs are the depth", () => {
    expect(parse("\t\t- x").depth).toBe(2);
    expect(parse("\t\t\t\t- x").depth).toBe(3);
  });

  it("code: one paragraph with U+2028 line breaks", () => {
    const parsed = parse("```swift let a = 1 let b = 2");
    expect(parsed.kind).toEqual(K.code("swift"));
    expect(parsed.content).toBe("let a = 1\nlet b = 2");
    expect(parse("``` x").kind).toEqual(K.code("plain text"));
    expect(parse("```").kind.t).toBe("paragraph");
  });

  const trips: [ParagraphKind, string][] = [
    [K.paragraph, "line one\nline two"], [K.paragraph, "- not a list"], [K.paragraph, "# not a heading"],
    [K.paragraph, "\\backslash"], [K.paragraph, "---"], [K.paragraph, ""], [K.heading2, "Head"],
    [K.toDo(true), "done"], [K.numbered, "n"], [K.quote, "q"], [K.code("python"), "print(1)\n\nprint(2)"],
    [K.code("plain text"), ""], [K.divider, ""],
  ];
  it.each(trips)("roundTrip: render then parse %j %j", (kind, content) => {
    const text = render(kind, content, 1);
    expect(text).not.toContain("\n");
    const parsed = parse(text);
    expect(kindEquals(parsed.kind, kind)).toBe(true);
    expect(parsed.content).toBe(content);
    expect(parsed.depth).toBe(1);
  });

  it("languages: aliases normalize, unknown ones are sent as plain text", () => {
    expect(normalizeLanguage("JS")).toBe("javascript");
    expect(sendableLanguage("klingon")).toBe("plain text");
    expect(sendableLanguage("Swift")).toBe("swift");
  });
});
