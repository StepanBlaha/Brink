import { arr, isObject, str, type JsonObject } from "./json";

/** A rich text item as returned by the Notion API (snake_case). */
export interface RichTextItem {
  plain_text: string;
  href?: string | null;
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean };
}

/** A run of text with Markdown-style formatting. Same JSON shape as the Swift Codable struct. */
export interface RichTextSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  code: boolean;
  link?: string;
}

export const chunkLimit = 2000;

export function span(text: string, o: Partial<Omit<RichTextSpan, "text">> = {}): RichTextSpan {
  const s: RichTextSpan = {
    text,
    bold: o.bold ?? false,
    italic: o.italic ?? false,
    strikethrough: o.strikethrough ?? false,
    code: o.code ?? false,
  };
  if (o.link !== undefined) s.link = o.link;
  return s;
}

export function decodeRichTextItems(v: unknown): RichTextItem[] {
  return arr(v).filter(isObject).map((o) => {
    const item: RichTextItem = { plain_text: str(o["plain_text"]) ?? "" };
    if (typeof o["href"] === "string") item.href = o["href"];
    if (isObject(o["annotations"])) item.annotations = o["annotations"] as NonNullable<RichTextItem["annotations"]>;
    return item;
  });
}

export function plainText(items: RichTextItem[]): string {
  return items.map((i) => i.plain_text).join("");
}

export function spansFrom(items: RichTextItem[]): RichTextSpan[] {
  return items.map((i) =>
    span(i.plain_text, {
      bold: i.annotations?.bold ?? false,
      italic: i.annotations?.italic ?? false,
      strikethrough: i.annotations?.strikethrough ?? false,
      code: i.annotations?.code ?? false,
      ...(i.href ? { link: i.href } : {}),
    }),
  );
}

let segmenter: Intl.Segmenter | undefined;

/** Splits into chunks of at most `limit` characters (grapheme clusters, like Swift `Character`). */
export function chunked(text: string, limit: number = chunkLimit): string[] {
  if (limit <= 0) return [text];
  if (text === "") return [""];
  if (text.length <= limit) return [text];
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const chars = Array.from(segmenter.segment(text), (s) => s.segment);
  const result: string[] = [];
  for (let i = 0; i < chars.length; i += limit) result.push(chars.slice(i, i + limit).join(""));
  return result;
}

/** Request-side rich text for plain text, chunked to the API limit. */
export function encodeText(text: string, limit: number = chunkLimit): JsonObject[] {
  return chunked(text, limit).map((content) => ({ type: "text", text: { content } }));
}

/** Request-side rich text for spans, keeping annotations and links. */
export function encodeSpans(spans: RichTextSpan[], limit: number = chunkLimit): JsonObject[] {
  return spans.flatMap((s) =>
    chunked(s.text, limit).map((content): JsonObject => {
      const box: JsonObject = { content };
      if (s.link !== undefined) box["link"] = { url: s.link };
      return {
        type: "text",
        text: box,
        annotations: { bold: s.bold, italic: s.italic, strikethrough: s.strikethrough, underline: false, code: s.code },
      };
    }),
  );
}

/** Tolerant decode of the queue/cache span JSON. */
export function decodeSpans(v: unknown): RichTextSpan[] {
  return arr(v).filter(isObject).map((o) =>
    span(str(o["text"]) ?? "", {
      bold: o["bold"] === true,
      italic: o["italic"] === true,
      strikethrough: o["strikethrough"] === true,
      code: o["code"] === true,
      ...(typeof o["link"] === "string" ? { link: o["link"] } : {}),
    }),
  );
}

export function encodeSpanJSON(s: RichTextSpan): JsonObject {
  const o: JsonObject = { text: s.text, bold: s.bold, italic: s.italic, strikethrough: s.strikethrough, code: s.code };
  if (s.link !== undefined) o["link"] = s.link;
  return o;
}
