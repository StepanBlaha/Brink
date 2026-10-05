import { formattedBlock, type NewBlock, type NewBlockKind } from "../notion/newBlock";
import { span, type RichTextSpan } from "../notion/richText";

/**
 * What capture and clipboard need from the Markdown parser. This is a faithful port of the
 * Swift `MarkdownParser`; when M5a lands `domain/markdown` the default can point there.
 */
export interface MarkdownPort {
  blocks(markdown: string): NewBlock[];
  detectPrefixedBlock(line: string): NewBlock | null;
  spans(text: string): RichTextSpan[];
}

type Chars = string[];

function matchDelimited(chars: Chars, i: number, marker: string): { content: string; next: number } | null {
  const m = Array.from(marker);
  const n = m.length;
  if (i + n > chars.length || !m.every((c, k) => chars[i + k] === c)) return null;
  for (let j = i + n; j + n <= chars.length; j++) {
    if (m.every((c, k) => chars[j + k] === c)) {
      if (j <= i + n) return null;
      return { content: chars.slice(i + n, j).join(""), next: j + n };
    }
  }
  return null;
}

function matchLink(chars: Chars, i: number): { s: RichTextSpan; next: number } | null {
  if (chars[i] !== "[") return null;
  const close = chars.indexOf("]", i + 1);
  if (close < 0 || chars[close + 1] !== "(") return null;
  const paren = chars.indexOf(")", close + 2);
  if (paren < 0) return null;
  const url = chars.slice(close + 2, paren).join("");
  if (url === "" || !URL.canParse(url)) return null;
  return { s: span(chars.slice(i + 1, close).join(""), { link: url }), next: paren + 1 };
}

function applying(spans: RichTextSpan[], o: Partial<RichTextSpan>): RichTextSpan[] {
  return spans.map((s) => ({ ...s, ...o }));
}

const inline: [string, Partial<RichTextSpan>][] = [
  ["***", { bold: true, italic: true }], ["**", { bold: true }], ["__", { bold: true }],
  ["~~", { strikethrough: true }], ["*", { italic: true }], ["_", { italic: true }],
];

function tryMatch(chars: Chars, i: number): { spans: RichTextSpan[]; next: number } | null {
  const code = matchDelimited(chars, i, "`");
  if (code) return { spans: [span(code.content, { code: true })], next: code.next };
  const link = matchLink(chars, i);
  if (link) return { spans: [link.s], next: link.next };
  for (const [marker, style] of inline) {
    const d = matchDelimited(chars, i, marker);
    if (d) return { spans: applying(spans(d.content), style), next: d.next };
  }
  return null;
}

export function spans(text: string): RichTextSpan[] {
  if (text === "") return [];
  const chars = Array.from(text);
  const out: RichTextSpan[] = [];
  let buffer = "";
  let i = 0;
  const flush = (): void => {
    if (buffer !== "") out.push(span(buffer));
    buffer = "";
  };
  while (i < chars.length) {
    const m = tryMatch(chars, i);
    if (m) {
      flush();
      out.push(...m.spans);
      i = m.next;
    } else {
      buffer += chars[i];
      i += 1;
    }
  }
  flush();
  return out;
}

function fmt(kind: NewBlockKind, rest: string, checked = false): NewBlock {
  const b = formattedBlock(kind, "", { checked });
  if (b.kind === "formatted") b.richText = spans(rest);
  return b;
}

const todoDone = ["- [x] ", "- [X] ", "[x] ", "[X] "];
const todoOpen = ["- [ ] ", "[ ] ", "[] ", "- [] "];
const prefixes: [string, NewBlockKind][] = [
  ["### ", "heading3"], ["## ", "heading2"], ["# ", "heading1"], ["> ", "quote"],
  ["- ", "bulletedListItem"], ["* ", "bulletedListItem"], ["+ ", "bulletedListItem"],
];

function blockForLine(line: string): NewBlock {
  const head = prefixes.slice(0, 3).find(([p]) => line.startsWith(p));
  if (head) return fmt(head[1], line.slice(head[0].length));
  const done = todoDone.find((p) => line.startsWith(p));
  if (done) return fmt("toDo", line.slice(done.length), true);
  const open = todoOpen.find((p) => line.startsWith(p));
  if (open) return fmt("toDo", line.slice(open.length), false);
  const rest = prefixes.slice(3).find(([p]) => line.startsWith(p));
  if (rest) return fmt(rest[1], line.slice(rest[0].length));
  const num = /^(\p{N}+)\. (.*)$/su.exec(line);
  if (num) return fmt("numberedListItem", num[2]!);
  return fmt("paragraph", line);
}

export function detectPrefixedBlock(line: string): NewBlock | null {
  if (line.startsWith("```") || line.trim() === "---") return null;
  const b = blockForLine(line);
  return b.kind === "formatted" && b.blockKind !== "paragraph" ? b : null;
}

export function blocks(markdown: string): NewBlock[] {
  const out: NewBlock[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line === "") { i += 1; continue; }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) { code.push(lines[i]!); i += 1; }
      if (i < lines.length) i += 1;
      out.push(formattedBlock("code", code.join("\n"), { language: language === "" ? "plain text" : language }));
      continue;
    }
    if (line.trim() === "---") { out.push(formattedBlock("divider", "")); i += 1; continue; }
    out.push(blockForLine(line));
    i += 1;
  }
  return out;
}

export const captureMarkdown: MarkdownPort = { blocks, detectPrefixedBlock, spans };
