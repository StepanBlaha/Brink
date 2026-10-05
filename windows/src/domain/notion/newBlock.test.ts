import { describe, expect, it } from "vitest";
import { decodeBlock } from "./block";
import { blockUpdateRequestJSON, formattedBlock, newBlockRequestJSON, positionAfter, positionEnd, positionRequestJSON, positionStart } from "./newBlock";
import { span } from "./richText";

describe("NewBlock request JSON", () => {
  it("paragraph and to-do use plain rich text", () => {
    expect(newBlockRequestJSON({ kind: "paragraph", text: "Hi" })).toEqual({
      type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Hi" } }] },
    });
    expect(newBlockRequestJSON({ kind: "toDo", text: "T", checked: true })).toEqual({
      type: "to_do", to_do: { rich_text: [{ type: "text", text: { content: "T" } }], checked: true },
    });
  });

  it("formatted: divider is empty, code carries language, to-do carries checked", () => {
    expect(newBlockRequestJSON(formattedBlock("divider", ""))).toEqual({ type: "divider", divider: {} });
    const code = newBlockRequestJSON(formattedBlock("code", "x", { language: "ts" })) as { code: Record<string, unknown> };
    expect(code.code["language"]).toBe("ts");
    expect(code.code["checked"]).toBeUndefined();
    const todo = newBlockRequestJSON(formattedBlock("toDo", "x", { checked: true })) as { to_do: Record<string, unknown> };
    expect(todo.to_do["checked"]).toBe(true);
    expect(todo.to_do["language"]).toBeUndefined();
  });

  it("callout icon only when emoji is non-empty; images", () => {
    const noIcon = newBlockRequestJSON({ kind: "callout", richText: [span("a")], emoji: "" }) as { callout: Record<string, unknown> };
    expect(noIcon.callout["icon"]).toBeUndefined();
    const icon = newBlockRequestJSON({ kind: "callout", richText: [], emoji: "\u{1F4A1}" }) as { callout: Record<string, unknown> };
    expect(icon.callout["icon"]).toEqual({ type: "emoji", emoji: "\u{1F4A1}" });
    expect(newBlockRequestJSON({ kind: "imageUpload", id: "fu-1" })).toEqual({
      type: "image", image: { type: "file_upload", file_upload: { id: "fu-1" } },
    });
  });

  it("position request JSON", () => {
    expect(positionRequestJSON(positionEnd)).toBeNull();
    expect(positionRequestJSON(positionStart)).toEqual({ type: "start" });
    expect(positionRequestJSON(positionAfter("b"))).toEqual({ type: "after_block", after_block: { id: "b" } });
  });

  it("block update bodies", () => {
    expect(blockUpdateRequestJSON("to_do", { kind: "checked", checked: true })).toEqual({ type: "to_do", to_do: { checked: true } });
    const callout = blockUpdateRequestJSON("callout", { kind: "calloutContent", richText: [span("n")] }) as { callout: Record<string, unknown> };
    expect(callout.callout["icon"]).toBeUndefined();
  });
});

describe("Block decoding extras", () => {
  it("callout icon, code language, child page, image source", () => {
    const callout = decodeBlock({ id: "c", type: "callout", callout: { rich_text: [{ plain_text: "x", annotations: { bold: true } }], icon: { type: "emoji", emoji: "A" } } });
    expect(callout.icon).toEqual({ type: "emoji", emoji: "A" });
    expect(callout.richText[0]).toEqual(span("x", { bold: true }));
    expect(decodeBlock({ id: "k", type: "code", code: { rich_text: [], language: "ts" } }).type).toEqual({ kind: "code", language: "ts" });
    const page = decodeBlock({ id: "p", type: "child_page", child_page: { title: "Sub" } });
    expect(page.type).toEqual({ kind: "childPage", title: "Sub" });
    expect(page.richText).toEqual([span("Sub")]);
    const img = decodeBlock({ id: "i", type: "image", image: { type: "external", external: { url: "https://x/y.png" } } });
    expect(img.imageSource).toBe("external:https://x/y.png");
    expect(img.type).toEqual({ kind: "unsupported", apiType: "image" });
  });
});
