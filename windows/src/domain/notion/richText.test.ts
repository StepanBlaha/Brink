import { describe, expect, it } from "vitest";
import { chunked, encodeText } from "./richText";

describe("RichText", () => {
  it("chunks text at the character limit", () => {
    const text = "a".repeat(4500);
    const chunks = chunked(text, 2000);
    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(2000);
    expect(chunks[1]!.length).toBe(2000);
    expect(chunks[2]!.length).toBe(500);
    expect(chunks.join("")).toBe(text);
  });

  it("short text is a single chunk", () => {
    expect(chunked("hello", 2000)).toEqual(["hello"]);
  });

  it("empty text yields one empty chunk", () => {
    expect(chunked("", 2000)).toEqual([""]);
  });

  it("encode produces text objects for each chunk", () => {
    const items = encodeText("b".repeat(2500), 2000);
    expect(items.length).toBe(2);
    const first = items[0] as { text: { content: string } };
    expect(first.text.content.length).toBe(2000);
  });

  it("chunks by grapheme, not UTF-16 unit", () => {
    expect(chunked("\u{1F600}\u{1F600}\u{1F600}", 2)).toEqual(["\u{1F600}\u{1F600}", "\u{1F600}"]);
  });
});
