import type { NewBlock } from "../notion/newBlock";
import { formattedBlock } from "../notion/newBlock";
import { span } from "../notion/richText";
import { captureMarkdown, type MarkdownPort } from "./captureMarkdown";

export type ClipboardContent = { kind: "text"; text: string } | { kind: "image" } | { kind: "empty" };
export type ClipboardResult = { blocks: NewBlock[] } | { unsupported: string };

export const imageMessage = "Images not supported yet";
export const emptyMessage = "Clipboard is empty";

/** A lone http(s) URL with no whitespace. */
export function singleURL(text: string): string | null {
  if (/\s/u.test(text) || !URL.canParse(text)) return null;
  const u = new URL(text);
  return (u.protocol === "http:" || u.protocol === "https:") && u.host !== "" ? text : null;
}

function paragraph(text: string, link?: string): NewBlock {
  const b = formattedBlock("paragraph", "");
  if (b.kind === "formatted") b.richText = [span(text, link === undefined ? {} : { link })];
  return b;
}

export function mapClipboard(content: ClipboardContent, md: MarkdownPort = captureMarkdown): ClipboardResult {
  if (content.kind === "image") return { unsupported: imageMessage };
  if (content.kind === "empty") return { unsupported: emptyMessage };
  const text = content.text.replace(/\r\n/g, "\n").trim();
  if (text === "") return { unsupported: emptyMessage };
  const url = singleURL(text);
  if (url !== null) return { blocks: [paragraph(text, url)] };
  if (text.includes("\n")) {
    const blocks = md.blocks(text);
    return blocks.length === 0 ? { unsupported: emptyMessage } : { blocks };
  }
  return { blocks: [paragraph(text)] };
}
