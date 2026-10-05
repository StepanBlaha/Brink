import { describe, expect, it } from "vitest";
import { decodeBlock } from "../domain/notion/block";
import { kindOfBlock, spansOfBlock } from "../domain/editor/blockConvert";
import { syncedParagraph } from "../domain/editor/types";
import { docFromSynced } from "./loadDocument";

const item = (text: string, annotations: Record<string, unknown> = {}, href?: string) => ({
  type: "text", text: { content: text }, plain_text: text, ...(href ? { href } : {}), annotations,
});

describe("loading a Notion page keeps rich text", () => {
  it("bold, italic, code, link, underline and color become marks", () => {
    const json = {
      object: "block", id: "p", type: "paragraph", has_children: false,
      paragraph: {
        rich_text: [
          item("bold ", { bold: true }), item("italic ", { italic: true }), item("code ", { code: true }),
          item("link ", {}, "https://example.com"), item("under ", { underline: true }),
          item("red", { color: "red" }), item(" plain"),
        ],
      },
    };
    const b = decodeBlock(json);
    const kind = kindOfBlock(b);
    const doc = docFromSynced([syncedParagraph({ blockId: "p", kind, spans: spansOfBlock(b, kind) })]);
    const runs: Record<string, string[]> = {};
    doc.firstChild!.forEach((n) => { if (n.isText) runs[n.text!.trim()] = n.marks.map((m) => m.type.name); });
    expect(runs["bold"]).toEqual(["bold"]);
    expect(runs["italic"]).toEqual(["italic"]);
    expect(runs["code"]).toEqual(["code"]);
    expect(runs["link"]).toEqual(["link"]);
    expect(runs["under"]).toEqual(["underline"]);
    expect(runs["red"]).toEqual(["color"]);
    expect(runs["plain"]).toEqual([]);
    expect(doc.firstChild!.textContent).not.toMatch(/[*[\]]/);
  });
});
