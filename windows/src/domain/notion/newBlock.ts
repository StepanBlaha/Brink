import { isObject, req, str, type JsonObject, type JsonValue } from "./json";
import { decodeSpans, encodeSpanJSON, encodeSpans, encodeText, span, type RichTextSpan } from "./richText";

export const newBlockKinds = [
  "paragraph", "heading1", "heading2", "heading3", "toDo", "bulletedListItem",
  "numberedListItem", "quote", "code", "divider", "toggle", "callout",
] as const;
export type NewBlockKind = (typeof newBlockKinds)[number];

const apiTypes: Record<NewBlockKind, string> = {
  paragraph: "paragraph", heading1: "heading_1", heading2: "heading_2", heading3: "heading_3",
  toDo: "to_do", bulletedListItem: "bulleted_list_item", numberedListItem: "numbered_list_item",
  quote: "quote", code: "code", divider: "divider", toggle: "toggle", callout: "callout",
};

export function apiType(kind: NewBlockKind): string {
  return apiTypes[kind];
}

/** A block to append. The JSON shape is exactly what Swift's synthesized `Codable` writes to pending.json. */
export type NewBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "toDo"; text: string; checked: boolean }
  | { kind: "formatted"; blockKind: NewBlockKind; richText: RichTextSpan[]; language: string; checked: boolean }
  | { kind: "callout"; richText: RichTextSpan[]; emoji?: string }
  | { kind: "imageUpload"; id: string }
  | { kind: "imageExternal"; url: string };

/** Convenience for a plain-text formatted block of any kind. */
export function formattedBlock(
  blockKind: NewBlockKind,
  text: string,
  o: { language?: string; checked?: boolean } = {},
): NewBlock {
  return {
    kind: "formatted",
    blockKind,
    richText: text === "" ? [] : [span(text)],
    language: o.language ?? "plain text",
    checked: o.checked ?? false,
  };
}

export type BlockPosition = { end: Record<string, never> } | { start: Record<string, never> } | { after: { _0: string } };

export const positionEnd: BlockPosition = { end: {} };
export const positionStart: BlockPosition = { start: {} };
export function positionAfter(blockId: string): BlockPosition {
  return { after: { _0: blockId } };
}

export type BlockUpdate =
  | { kind: "text"; text: string }
  | { kind: "checked"; checked: boolean }
  | { kind: "richText"; richText: RichTextSpan[] }
  | { kind: "content"; richText: RichTextSpan[]; checked?: boolean; language?: string }
  | { kind: "calloutContent"; richText: RichTextSpan[]; emoji?: string };

/** `null` for the API default (end); the `position` request param otherwise. */
export function positionRequestJSON(p: BlockPosition): JsonValue | null {
  if ("start" in p) return { type: "start" };
  if ("after" in p) return { type: "after_block", after_block: { id: p.after._0 } };
  return null;
}

export function newBlockRequestJSON(b: NewBlock): JsonObject {
  switch (b.kind) {
    case "paragraph":
      return { type: "paragraph", paragraph: { rich_text: encodeText(b.text) } };
    case "toDo":
      return { type: "to_do", to_do: { rich_text: encodeText(b.text), checked: b.checked } };
    case "formatted": {
      const t = apiType(b.blockKind);
      if (b.blockKind === "divider") return { type: t, [t]: {} };
      const box: JsonObject = { rich_text: encodeSpans(b.richText) };
      if (b.blockKind === "toDo") box["checked"] = b.checked;
      if (b.blockKind === "code") box["language"] = b.language;
      return { type: t, [t]: box };
    }
    case "callout": {
      const box: JsonObject = { rich_text: encodeSpans(b.richText) };
      if (b.emoji) box["icon"] = { type: "emoji", emoji: b.emoji };
      return { type: "callout", callout: box };
    }
    case "imageUpload":
      return { type: "image", image: { type: "file_upload", file_upload: { id: b.id } } };
    case "imageExternal":
      return { type: "image", image: { type: "external", external: { url: b.url } } };
  }
}

/** The `PATCH /blocks/{id}` body for `BlockUpdate` (NotionClient.updateBlock). */
export function blockUpdateRequestJSON(type: string, u: BlockUpdate): JsonObject {
  let box: JsonObject;
  switch (u.kind) {
    case "text":
      box = { rich_text: encodeText(u.text) };
      break;
    case "checked":
      box = { checked: u.checked };
      break;
    case "richText":
      box = { rich_text: encodeSpans(u.richText) };
      break;
    case "content":
      box = { rich_text: encodeSpans(u.richText) };
      if (u.checked !== undefined) box["checked"] = u.checked;
      if (u.language !== undefined) box["language"] = u.language;
      break;
    case "calloutContent":
      box = { rich_text: encodeSpans(u.richText) };
      if (u.emoji) box["icon"] = { type: "emoji", emoji: u.emoji };
      break;
  }
  return { type, [type]: box };
}

function isKind(v: string | undefined): v is NewBlockKind {
  return (newBlockKinds as readonly string[]).includes(v ?? "");
}

export function decodeNewBlock(v: unknown): NewBlock {
  if (!isObject(v)) throw new Error("NewBlock must be an object");
  const kind = req(v, "kind");
  switch (kind) {
    case "paragraph":
      return { kind, text: req(v, "text") };
    case "toDo":
      return { kind, text: req(v, "text"), checked: v["checked"] === true };
    case "formatted": {
      const blockKind = str(v["blockKind"]);
      if (!isKind(blockKind)) throw new Error("Unknown blockKind");
      return {
        kind,
        blockKind,
        richText: decodeSpans(v["richText"]),
        language: str(v["language"]) ?? "plain text",
        checked: v["checked"] === true,
      };
    }
    case "callout": {
      const emoji = str(v["emoji"]);
      return emoji === undefined
        ? { kind, richText: decodeSpans(v["richText"]) }
        : { kind, richText: decodeSpans(v["richText"]), emoji };
    }
    case "imageUpload":
      return { kind, id: req(v, "id") };
    case "imageExternal":
      return { kind, url: req(v, "url") };
    default:
      throw new Error(`Unknown NewBlock kind ${kind}`);
  }
}

export function encodeNewBlock(b: NewBlock): JsonObject {
  switch (b.kind) {
    case "paragraph":
      return { kind: "paragraph", text: b.text };
    case "toDo":
      return { kind: "toDo", text: b.text, checked: b.checked };
    case "formatted":
      return {
        kind: "formatted",
        blockKind: b.blockKind,
        richText: b.richText.map(encodeSpanJSON),
        language: b.language,
        checked: b.checked,
      };
    case "callout": {
      const o: JsonObject = { kind: "callout", richText: b.richText.map(encodeSpanJSON) };
      if (b.emoji !== undefined) o["emoji"] = b.emoji;
      return o;
    }
    case "imageUpload":
      return { kind: "imageUpload", id: b.id };
    case "imageExternal":
      return { kind: "imageExternal", url: b.url };
  }
}

export function decodePosition(v: unknown): BlockPosition {
  if (!isObject(v)) return positionEnd;
  if (isObject(v["after"]) && typeof v["after"]["_0"] === "string") return positionAfter(v["after"]["_0"]);
  if ("start" in v) return positionStart;
  return positionEnd;
}

export function encodePosition(p: BlockPosition): JsonObject {
  if ("after" in p) return { after: { _0: p.after._0 } };
  if ("start" in p) return { start: {} };
  return { end: {} };
}

export function decodeBlockUpdate(v: unknown): BlockUpdate {
  if (!isObject(v)) throw new Error("BlockUpdate must be an object");
  const kind = req(v, "kind");
  switch (kind) {
    case "text":
      return { kind, text: req(v, "text") };
    case "checked":
      if (typeof v["checked"] !== "boolean") throw new Error("checked must be boolean");
      return { kind, checked: v["checked"] };
    case "richText":
      return { kind, richText: decodeSpans(v["richText"]) };
    case "content": {
      const u: BlockUpdate = { kind, richText: decodeSpans(v["richText"]) };
      if (typeof v["checked"] === "boolean") u.checked = v["checked"];
      if (typeof v["language"] === "string") u.language = v["language"];
      return u;
    }
    case "calloutContent": {
      const u: BlockUpdate = { kind, richText: decodeSpans(v["richText"]) };
      if (typeof v["emoji"] === "string") u.emoji = v["emoji"];
      return u;
    }
    default:
      throw new Error(`Unknown BlockUpdate kind ${kind}`);
  }
}

export function encodeBlockUpdate(u: BlockUpdate): JsonObject {
  switch (u.kind) {
    case "text":
      return { kind: "text", text: u.text };
    case "checked":
      return { kind: "checked", checked: u.checked };
    case "richText":
      return { kind: "richText", richText: u.richText.map(encodeSpanJSON) };
    case "content": {
      const o: JsonObject = { kind: "content", richText: u.richText.map(encodeSpanJSON) };
      if (u.checked !== undefined) o["checked"] = u.checked;
      if (u.language !== undefined) o["language"] = u.language;
      return o;
    }
    case "calloutContent": {
      const o: JsonObject = { kind: "calloutContent", richText: u.richText.map(encodeSpanJSON) };
      if (u.emoji !== undefined) o["emoji"] = u.emoji;
      return o;
    }
  }
}
