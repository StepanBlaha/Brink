import { describe, expect, it } from "vitest";
import { span } from "../notion/richText";
import { formattedBlock } from "../notion/newBlock";
import type { Pin } from "../store/pin";
import { captureMarkdown as md } from "./captureMarkdown";
import { planCapture } from "./captureRequest";
import { mapClipboard } from "./clipboardMapper";
import { captureText, destination, planInbox, toggleOperation } from "./inboxCapture";

const now = new Date(2026, 8, 29, 10, 0);
const page: Pin = { id: "p1", notionId: "page-1", kind: "page", title: "Inbox", icon: { none: {} }, order: 0 };
const db: Pin = {
  id: "p2", notionId: "ds-1", kind: "dataSource", title: "Buylist", icon: { none: {} }, order: 1,
  config: { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false },
};
const para = (text: string, link?: string) => ({
  ...formattedBlock("paragraph", ""), richText: [span(text, link ? { link } : {})],
});

describe("clipboard to blocks", () => {
  it("URL becomes a linked paragraph titled with the URL", () => {
    expect(mapClipboard({ kind: "text", text: "  https://example.com/a?b=1 \n" })).toEqual({
      blocks: [para("https://example.com/a?b=1", "https://example.com/a?b=1")],
    });
  });
  it("plain single line becomes a paragraph", () => {
    expect(mapClipboard({ kind: "text", text: "hello world" })).toEqual({ blocks: [para("hello world")] });
  });
  it("text with a URL and words is a plain paragraph", () => {
    expect(mapClipboard({ kind: "text", text: "see https://example.com" })).toEqual({
      blocks: [para("see https://example.com")],
    });
  });
  it("multi-line text goes through the Markdown parser", () => {
    const src = "# Title\n- one\n- two\n\nbody";
    const r = mapClipboard({ kind: "text", text: src });
    expect(r).toEqual({ blocks: md.blocks(src) });
    expect("blocks" in r && r.blocks.length).toBe(4);
  });
  it("CRLF is normalised", () => {
    const r = mapClipboard({ kind: "text", text: "- a\r\n- b" });
    expect("blocks" in r && r.blocks.length).toBe(2);
  });
  it("images and empty clipboard are unsupported", () => {
    expect(mapClipboard({ kind: "image" })).toEqual({ unsupported: "Images not supported yet" });
    expect(mapClipboard({ kind: "empty" })).toEqual({ unsupported: "Clipboard is empty" });
    expect(mapClipboard({ kind: "text", text: "  \n " })).toEqual({ unsupported: "Clipboard is empty" });
  });
});

describe("destination to request shape", () => {
  it("page pin appends a to-do", () => {
    const plan = planCapture("call *mom*", page, null, now)!;
    expect(plan.operation).toEqual({
      kind: "appendBlock", parentId: "page-1",
      block: { ...formattedBlock("toDo", ""), richText: md.spans("call *mom*"), checked: false },
    });
  });
  it("page pin honors a Markdown shortcut", () => {
    const plan = planCapture("# Ideas", page, null, now)!;
    expect(plan.operation).toEqual({
      kind: "appendBlock", parentId: "page-1", block: formattedBlock("heading1", "Ideas"),
    });
  });
  it("database pin creates a row and parses the date into the date property", () => {
    const plan = planCapture("Milk tomorrow 5pm", db, "Due", now)!;
    expect(plan.operation).toEqual({
      kind: "createRow", dataSourceId: "ds-1", title: "Milk",
      extra: [{ name: "Due", value: { type: "date", date: { start: "2026-09-30T17:00:00+02:00" } } }],
    });
    expect(plan.savedText).toBe("Milk");
  });
  it("database without a date property keeps the whole text as title", () => {
    expect(planCapture("Milk tomorrow", db, null, now)!.operation).toEqual({
      kind: "createRow", dataSourceId: "ds-1", title: "Milk tomorrow", extra: [],
    });
  });
  it("date-only text yields a date-only start", () => {
    const plan = planCapture("Milk tomorrow", db, "Due", now)!;
    expect(plan.operation).toMatchObject({ extra: [{ value: { date: { start: "2026-09-30" } } }] });
  });
  it("empty input yields no plan", () => {
    expect(planCapture("  ", db, "Due")).toBeNull();
  });
});

describe("shared data: capture and toggle mapping", () => {
  it("capture action maps to the quick-capture plan", () => {
    const r = planInbox({ text: "Article", url: "https://example.com/a", pinId: "p1", pins: [page, db] }, now)!;
    expect(r.pin.id).toBe("p1");
    expect(r.plan).toEqual(planCapture("[Article](https://example.com/a)", page, null, now));
    expect(r.plan.operation).toMatchObject({ kind: "appendBlock", parentId: "page-1" });

    const d = planInbox({ text: "Milk", pins: [page, db], fallbackID: "p2" }, now)!;
    expect(d.pin.id).toBe("p2");
    expect(d.plan.operation).toMatchObject({ kind: "createRow", dataSourceId: "ds-1", title: "Milk" });

    expect(captureText("", "https://x.y", "page")).toBe("https://x.y");
    expect(captureText("see https://x.y", "https://x.y", "page")).toBe("see https://x.y");
    expect(captureText("Milk", "https://x.y", "dataSource")).toBe("Milk https://x.y");
    expect(captureText("a [b]", "https://x.y", "page")).toBe("[a (b)](https://x.y)");
    expect(planInbox({ text: "  ", pins: [page] }, now)).toBeNull();
    expect(destination("gone", [db, page], undefined)?.id).toBe("p1");
  });
  it("toggle action maps to tick writes", () => {
    expect(toggleOperation(page, "b1", true)).toEqual({
      kind: "updateBlock", blockId: "b1", type: "to_do", update: { kind: "checked", checked: true },
    });
    expect(toggleOperation(db, "r1", false)).toEqual({
      kind: "toggleDone", pageId: "r1", update: { name: "Done", value: { type: "checkbox", checkbox: false } },
    });
    const status: Pin = { ...db, config: { ...db.config!, doneKind: "status", doneValue: "Done" } };
    expect(toggleOperation(status, "r1", false)).toBeNull();
    expect(toggleOperation(status, "r1", true)).toMatchObject({ update: { value: { type: "status", status: { name: "Done" } } } });
  });
});
