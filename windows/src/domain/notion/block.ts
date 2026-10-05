import { decodeIcon, type Icon } from "./icon";
import { isObject, req, str } from "./json";
import { decodeRichTextItems, span, spansFrom, type RichTextSpan } from "./richText";

export type BlockType =
  | { kind: "paragraph" }
  | { kind: "heading1" }
  | { kind: "heading2" }
  | { kind: "heading3" }
  | { kind: "toDo"; checked: boolean }
  | { kind: "bulletedListItem" }
  | { kind: "numberedListItem" }
  | { kind: "toggle" }
  | { kind: "quote" }
  | { kind: "callout" }
  | { kind: "divider" }
  | { kind: "code"; language: string }
  | { kind: "childDatabase"; title: string }
  | { kind: "childPage"; title: string }
  | { kind: "unsupported"; apiType: string };

export interface Block {
  id: string;
  type: BlockType;
  hasChildren: boolean;
  /** Empty for blocks with no text; child page/database keep their title as one plain span. */
  richText: RichTextSpan[];
  icon?: Icon;
  /** Images only (type unsupported "image"): "file:URL", "external:URL" or "upload:ID". */
  imageSource?: string;
}

export function blockPlainText(b: Block): string {
  return b.richText.map((s) => s.text).join("");
}

const simple: Record<string, [BlockType, string]> = {
  paragraph: [{ kind: "paragraph" }, "paragraph"],
  heading_1: [{ kind: "heading1" }, "heading_1"],
  heading_2: [{ kind: "heading2" }, "heading_2"],
  heading_3: [{ kind: "heading3" }, "heading_3"],
  bulleted_list_item: [{ kind: "bulletedListItem" }, "bulleted_list_item"],
  numbered_list_item: [{ kind: "numberedListItem" }, "numbered_list_item"],
  toggle: [{ kind: "toggle" }, "toggle"],
  quote: [{ kind: "quote" }, "quote"],
};

function boxSpans(box: unknown): RichTextSpan[] {
  return isObject(box) ? spansFrom(decodeRichTextItems(box["rich_text"])) : [];
}

function titleOf(box: unknown): string | undefined {
  return isObject(box) ? str(box["title"]) : undefined;
}

function imageSource(box: unknown): string | undefined {
  if (!isObject(box)) return undefined;
  const url = (k: string): string | undefined => (isObject(box[k]) ? str((box[k] as Record<string, unknown>)["url"]) : undefined);
  const file = url("file");
  if (file !== undefined) return `file:${file}`;
  const external = url("external");
  if (external !== undefined) return `external:${external}`;
  const up = isObject(box["file_upload"]) ? str(box["file_upload"]["id"]) : undefined;
  return up !== undefined ? `upload:${up}` : undefined;
}

/** Decodes a Notion API block object (snake_case). */
export function decodeBlock(v: unknown): Block {
  if (!isObject(v)) throw new Error("Block must be an object");
  const typeName = req(v, "type");
  const block: Block = { id: req(v, "id"), type: { kind: "unsupported", apiType: typeName }, hasChildren: v["has_children"] === true, richText: [] };
  const simpleEntry = simple[typeName];
  if (simpleEntry) {
    block.type = simpleEntry[0];
    block.richText = boxSpans(v[simpleEntry[1]]);
    return block;
  }
  switch (typeName) {
    case "to_do": {
      const box = v["to_do"];
      block.type = { kind: "toDo", checked: isObject(box) && box["checked"] === true };
      block.richText = boxSpans(box);
      break;
    }
    case "callout": {
      const box = v["callout"];
      block.type = { kind: "callout" };
      block.richText = boxSpans(box);
      if (isObject(box) && isObject(box["icon"])) block.icon = decodeIcon(box["icon"]);
      break;
    }
    case "divider":
      block.type = { kind: "divider" };
      break;
    case "code": {
      const box = v["code"];
      block.type = { kind: "code", language: (isObject(box) ? str(box["language"]) : undefined) ?? "plain text" };
      block.richText = boxSpans(box);
      break;
    }
    case "child_database":
    case "child_page": {
      const title = titleOf(v[typeName]);
      block.type =
        typeName === "child_page" ? { kind: "childPage", title: title ?? "Untitled" } : { kind: "childDatabase", title: title ?? "Untitled" };
      block.richText = title ? [span(title)] : [];
      break;
    }
    case "image": {
      const src = imageSource(v["image"]);
      if (src !== undefined) block.imageSource = src;
      break;
    }
    default:
      break;
  }
  return block;
}

/** Blocks from either a bare array or a `{ results }` list response. */
export function decodeBlocks(v: unknown): Block[] {
  const results = Array.isArray(v) ? v : isObject(v) && Array.isArray(v["results"]) ? v["results"] : [];
  return results.map(decodeBlock);
}
