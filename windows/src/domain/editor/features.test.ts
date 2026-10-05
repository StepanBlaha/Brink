import { describe, expect, it } from "vitest";
import { TestEditorHost } from "../../test/editorHost";
import { decodeBlock } from "../notion/block";
import { newBlockRequestJSON } from "../notion/newBlock";
import { decodePageMeta } from "../notion/pageMeta";
import { span } from "../notion/richText";
import { K, kindEquals } from "../markdown/paragraphKind";
import { matching, slashCommands, slashKind, type SlashCommand } from "../markdown/slashCommand";
import { blockUpdate, kindOfBlock, newBlockFor } from "./blockConvert";
import { d, s, unchanged } from "./plannerHelpers";
import { plan } from "./syncPlanner";
import { docParagraph, syncedParagraph } from "./types";
import { at } from "./engineHarness";

describe("Slash commands", () => {
  it("empty query lists every command in menu order", () => expect(matching("")).toEqual([...slashCommands]));

  const table: [string, SlashCommand[]][] = [
    ["h", ["heading1", "heading2", "heading3", "divider"]], ["head", ["heading1", "heading2", "heading3"]], ["h2", ["heading2"]],
    ["to", ["toDo", "toggle"]], ["todo", ["toDo"]], ["list", ["bulleted", "numbered"]], ["call", ["callout"]],
    ["note", ["callout"]], ["hr", ["divider"]], ["zzz", []],
  ];
  it.each(table)("fuzzy prefix filtering: %s", (query, expected) => expect(matching(query)).toEqual(expected));

  it("title-prefix matches rank before keyword matches", () => expect(matching("c").slice(0, 2)).toEqual(["code", "callout"]));

  it("each command maps to its block kind; callout and code keep their settings", () => {
    expect(slashKind("heading2", K.bulleted)).toEqual(K.heading2);
    expect(slashKind("toDo", K.paragraph)).toEqual(K.toDo(false));
    expect(slashKind("text", K.toggle)).toEqual(K.paragraph);
    expect(slashKind("callout", K.callout("🔥"))).toEqual(K.callout("🔥"));
    expect(slashKind("callout", K.paragraph)).toEqual(K.callout("💡"));
    expect(slashKind("code", K.code("swift"))).toEqual(K.code("swift"));
  });

  it("applying removes the /query text and converts the block (one undo step)", () => {
    const host = new TestEditorHost([syncedParagraph({ blockId: "a", kind: K.paragraph, content: "buy milk " })]);
    host.type(0, 9, "/tod");
    host.applySlash(0, slashKind("toDo", K.paragraph), 9);
    expect(host.text()).toBe("buy milk ");
    expect(host.hasKinds([K.toDo(false)])).toBe(true);
    host.undo();
    expect(host.text()).toBe("buy milk /tod");
    expect(host.hasKinds([K.paragraph])).toBe(true);
  });

  it("divider on an empty line becomes a divider with a new line below; with text it goes below", () => {
    const empty = new TestEditorHost([syncedParagraph({ blockId: "a", kind: K.paragraph, content: "" })]);
    empty.type(0, 0, "/div");
    empty.applySlash(0, K.divider, 0);
    expect(empty.hasKinds([K.divider, K.paragraph])).toBe(true);
    const text = new TestEditorHost([syncedParagraph({ blockId: "a", kind: K.paragraph, content: "keep " })]);
    text.type(0, 5, "/div");
    text.applySlash(0, K.divider, 5);
    expect(text.hasKinds([K.paragraph, K.divider, K.paragraph])).toBe(true);
    expect(text.paragraphs()[0]!.blockId).toBe("a");
  });
});

describe("Toggle & callout blocks", () => {
  it("planner: a new toggle with 2 children is an insert of the toggle, then both children under it", () => {
    const prev = [s("a", "A")];
    const toggle = docParagraph({ localId: "T", blockId: null, kind: K.toggle, content: "Details" });
    const c1 = docParagraph({ localId: "C1", blockId: null, kind: K.paragraph, content: "one", depth: 1 });
    const c2 = docParagraph({ localId: "C2", blockId: null, kind: K.bulleted, content: "two", depth: 1 });
    const current = [d("a", "A"), toggle, c1, c2];
    expect(plan(prev, current)).toEqual([
      { t: "insert", parent: { t: "page" }, position: { t: "after", blockId: "a" }, paragraphs: [toggle] },
      { t: "insert", parent: { t: "pending", localId: "T" }, position: { t: "start" }, paragraphs: [c1, c2] },
    ]);
  });

  it("planner: editing callout text is an in-place update; paragraph to callout recreates", () => {
    const prev = [s("c", "Heads up", K.callout("💡"))];
    expect(plan(prev, [d("c", "Heads up!", K.callout("💡"))])).toEqual([
      { t: "update", blockId: "c", kind: K.callout("💡"), content: "Heads up!" },
    ]);
    const ops = plan(prev, [d("c", "Heads up", K.paragraph)]);
    expect(ops).toHaveLength(2);
    expect(ops[1]).toEqual({ t: "delete", blockId: "c" });
  });

  it("callout update only sends the icon when it changed", () => {
    const x = [span("x")];
    expect(blockUpdate(K.callout("💡"), x, K.callout("💡"))).toEqual({ kind: "calloutContent", richText: x });
    expect(blockUpdate(K.callout("🔥"), x, K.callout("💡"))).toEqual({ kind: "calloutContent", richText: x, emoji: "🔥" });
    expect(blockUpdate(K.callout(""), x, K.paragraph)).toEqual({ kind: "calloutContent", richText: x });
  });

  it("new blocks: toggle and callout request shapes", () => {
    const toggle = newBlockRequestJSON(newBlockFor(docParagraph({ blockId: null, kind: K.toggle, content: "T" })));
    const callout = newBlockRequestJSON(newBlockFor(docParagraph({ blockId: null, kind: K.callout("🔥"), content: "C" })));
    expect(toggle["type"]).toBe("toggle");
    expect((at(toggle, "toggle", "rich_text") as unknown[]).length).toBe(1);
    expect(callout["type"]).toBe("callout");
    expect(at(callout, "callout", "icon", "emoji")).toBe("🔥");
    expect(at(callout, "callout", "icon", "type")).toBe("emoji");
  });

  it("callout blocks decode their emoji icon", () => {
    const json = { object: "block", id: "c", type: "callout", has_children: false, callout: {
      rich_text: [{ type: "text", text: { content: "Hi" }, plain_text: "Hi" }], icon: { type: "emoji", emoji: "🔥" }, color: "gray_background" } };
    const block = decodeBlock(json);
    expect(block.type.kind).toBe("callout");
    expect(block.icon).toEqual({ type: "emoji", emoji: "🔥" });
    expect(kindOfBlock(block)).toEqual(K.callout("🔥"));
    expect(kindOfBlock(decodeBlock({ id: "t", type: "toggle", has_children: true, toggle: { rich_text: [] } }))).toEqual(K.toggle);
  });
});

describe("Document kinds (array model)", () => {
  const blocks = () => [
    syncedParagraph({ blockId: "t", kind: K.toggle, content: "Details" }),
    syncedParagraph({ blockId: "c1", parentId: "t", kind: K.paragraph, content: "inside" }),
    syncedParagraph({ blockId: "k", kind: K.callout("🔥"), content: "Note" }),
  ];

  it("toggle/callout load with their kind, round-trip with no ops, split keeps the kind on the first half", () => {
    const host = new TestEditorHost(blocks());
    expect(host.text()).toBe("Details\ninside\nNote");
    expect(host.hasKinds([K.toggle, K.paragraph, K.callout("🔥")])).toBe(true);
    expect(plan(blocks(), host.paragraphs())).toEqual([]);
    host.split(2, 2);
    expect(host.hasKinds([K.toggle, K.paragraph, K.callout("🔥"), K.paragraph])).toBe(true);
    expect(host.blockIds()).toEqual(["t", "c1", "k", null]);
  });

  it("setting a paragraph kind converts the paragraph and counts as a local edit", () => {
    const host = new TestEditorHost([syncedParagraph({ blockId: "a", kind: K.paragraph, content: "x" })]);
    let edits = 0;
    host.onLocalEdit = () => { edits++; };
    host.setKind(0, K.toggle);
    expect(kindEquals(host.paragraphs()[0]!.kind, K.toggle)).toBe(true);
    expect(edits).toBe(1);
    host.setKind(0, K.paragraph);
    expect(host.paragraphs()[0]!.kind).toEqual(K.paragraph);
  });

  it("collapsing a toggle hides exactly its deeper-indented children (local only)", () => {
    const host = new TestEditorHost([
      syncedParagraph({ blockId: "t", kind: K.toggle, content: "T" }),
      syncedParagraph({ blockId: "a", parentId: "t", kind: K.paragraph, content: "a" }),
      syncedParagraph({ blockId: "b", parentId: "a", kind: K.paragraph, content: "b" }),
      syncedParagraph({ blockId: "z", kind: K.paragraph, content: "z" }),
    ]);
    expect(host.text()).toBe("T\na\nb\nz");
    const generation = host.editGeneration;
    host.toggleCollapsed(0);
    expect(host.isCollapsed(0)).toBe(true);
    expect(host.hiddenIndices()).toEqual([1, 2]);
    expect(host.editGeneration).toBe(generation); // collapsing is not an edit
    host.toggleCollapsed(0);
    expect(host.hiddenIndices()).toEqual([]);
  });

  it("an unchanged mirror of the loaded state plans nothing", () => {
    const prev = [s("a", "A", K.bulleted), s("b", "B", K.toDo(true), { parent: "a" })];
    expect(plan(prev, unchanged(prev))).toEqual([]);
  });
});

describe("Page cover", () => {
  it("external and Notion-hosted covers decode; icon too", () => {
    const meta = decodePageMeta({ object: "page", id: "p", cover: { type: "external", external: { url: "https://images.example.com/c.jpg" } }, icon: { type: "emoji", emoji: "📚" } });
    expect(meta.cover).toEqual({ url: "https://images.example.com/c.jpg", expires: false });
    expect(meta.icon).toEqual({ type: "emoji", emoji: "📚" });
    const hosted = decodePageMeta({ object: "page", id: "p", cover: { type: "file", file: { url: "https://s3.example.com/c.png?X-Amz-Signature=abc", expiry_time: "2026-09-28T12:00:00.000Z" } }, icon: null });
    expect(hosted.cover?.expires).toBe(true);
    expect(hosted.icon).toBeUndefined();
    expect(decodePageMeta({ object: "page", id: "p", cover: null }).cover).toBeUndefined();
  });
  // The cover cache key (query ignored, FNV-1a 64) is tested in Rust: src-tauri/src/store/covers.rs.
});
