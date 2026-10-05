import type { RichTextSpan } from "../notion/richText";
import { spans as parseSpans } from "./markdownParser";
import { markdown } from "./markdownSerializer";
import type { ParagraphKind } from "./paragraphKind";

function sameFormat(a: RichTextSpan, b: RichTextSpan): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.strikethrough === b.strikethrough && a.code === b.code &&
    a.link === b.link && (a.underline ?? false) === (b.underline ?? false) && a.color === b.color;
}

/** Merges adjacent runs with identical formatting and drops empty ones. */
export function normalize(spans: RichTextSpan[]): RichTextSpan[] {
  const out: RichTextSpan[] = [];
  for (const s of spans) {
    if (s.text === "") continue;
    const last = out[out.length - 1];
    if (last && sameFormat(last, s)) out[out.length - 1] = { ...last, text: last.text + s.text };
    else out.push(s);
  }
  return out;
}

/**
 * The planner's content key. Markdown has no underline or color, so when a run has either the key
 * gets a suffix listing them, which lets those changes count as edits (PORT 9.12).
 */
export function key(spans: RichTextSpan[], kind: ParagraphKind): string {
  const n = normalize(spans);
  switch (kind.t) {
    case "code": return n.map((s) => s.text).join("");
    case "divider":
    case "token":
    case "image": return "";
    default: {
      const md = markdown(n);
      if (!n.some((s) => s.underline || s.color !== undefined)) return md;
      return `${md}\u0000${n.map((s) => `${s.underline ? "u" : ""}${s.color ?? ""}`).join("|")}`;
    }
  }
}

/** Spans for a content string given as inline Markdown (plain text for code). */
export function spansFromContent(content: string, kind: ParagraphKind): RichTextSpan[] {
  switch (kind.t) {
    case "code": return content === "" ? [] : [{ text: content, bold: false, italic: false, strikethrough: false, code: false }];
    case "divider":
    case "token":
    case "image": return [];
    default: return normalize(parseSpans(content));
  }
}
