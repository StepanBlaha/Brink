import type { NewBlock, NewBlockKind } from "../notion/newBlock";
import { span, type RichTextSpan } from "../notion/richText";

function formatted(blockKind: NewBlockKind, richText: RichTextSpan[], o: { language?: string; checked?: boolean } = {}): NewBlock {
  return { kind: "formatted", blockKind, richText, language: o.language ?? "plain text", checked: o.checked ?? false };
}

const trimWs = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, "");

/** Splits multi-line Markdown into the blocks it describes. */
export function blocks(markdown: string): NewBlock[] {
  const result: NewBlock[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line === "") { i++; continue; }
    if (line.startsWith("```")) {
      const language = trimWs(line.slice(3));
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) { code.push(lines[i]!); i++; }
      if (i < lines.length) i++;
      const content = code.join("\n");
      result.push(formatted("code", content === "" ? [] : [span(content)], { language: language === "" ? "plain text" : language }));
      continue;
    }
    if (trimWs(line) === "---") { result.push(formatted("divider", [])); i++; continue; }
    result.push(blockForLine(line));
    i++;
  }
  return result;
}

/** A conversion prefix (heading/list/to-do/quote) at the start of `line`, else null. */
export function detectPrefixedBlock(line: string): NewBlock | null {
  if (line.startsWith("```") || trimWs(line) === "---") return null;
  const b = blockForLine(line);
  return b.kind === "formatted" && b.blockKind !== "paragraph" ? b : null;
}

function strip(line: string, prefix: string): string | null {
  return line.startsWith(prefix) ? line.slice(prefix.length) : null;
}

function stripToDo(line: string, checked: boolean): string | null {
  const prefixes = checked ? ["- [x] ", "- [X] ", "[x] ", "[X] "] : ["- [ ] ", "[ ] ", "[] ", "- [] "];
  for (const p of prefixes) if (line.startsWith(p)) return line.slice(p.length);
  return null;
}

function stripNumbered(line: string): string | null {
  const dot = line.indexOf(".");
  if (dot <= 0) return null;
  if (!/^\p{N}+$/u.test(line.slice(0, dot))) return null;
  if (line[dot + 1] !== " ") return null;
  return line.slice(dot + 2);
}

function blockForLine(line: string): NewBlock {
  let r: string | null;
  if ((r = strip(line, "### ")) !== null) return formatted("heading3", spans(r));
  if ((r = strip(line, "## ")) !== null) return formatted("heading2", spans(r));
  if ((r = strip(line, "# ")) !== null) return formatted("heading1", spans(r));
  if ((r = stripToDo(line, true)) !== null) return formatted("toDo", spans(r), { checked: true });
  if ((r = stripToDo(line, false)) !== null) return formatted("toDo", spans(r), { checked: false });
  if ((r = strip(line, "> ")) !== null) return formatted("quote", spans(r));
  for (const p of ["- ", "* ", "+ "]) if ((r = strip(line, p)) !== null) return formatted("bulletedListItem", spans(r));
  if ((r = stripNumbered(line)) !== null) return formatted("numberedListItem", spans(r));
  return formatted("paragraph", spans(line));
}

/** Parses one line into spans. A marker with no matching closer stays literal. */
export function spans(text: string): RichTextSpan[] {
  if (text === "") return [];
  const chars = Array.from(text);
  const result: RichTextSpan[] = [];
  let buffer = "";
  let i = 0;
  const flush = (): void => {
    if (buffer !== "") { result.push(span(buffer)); buffer = ""; }
  };
  while (i < chars.length) {
    const m = tryMatch(chars, i);
    if (m) { flush(); result.push(...m.spans); i = m.next; }
    else { buffer += chars[i]; i++; }
  }
  flush();
  return result;
}

interface Match { spans: RichTextSpan[]; next: number }

function applying(list: RichTextSpan[], f: Partial<Pick<RichTextSpan, "bold" | "italic" | "strikethrough">>): RichTextSpan[] {
  return list.map((s) => ({ ...s, ...f }));
}

function tryMatch(chars: string[], i: number): Match | null {
  let d = matchDelimited(chars, i, "`");
  if (d) return { spans: [span(d.content, { code: true })], next: d.next };
  const link = matchLink(chars, i);
  if (link) return { spans: [link.span], next: link.next };
  const table: [string, Partial<Pick<RichTextSpan, "bold" | "italic" | "strikethrough">>][] = [
    ["***", { bold: true, italic: true }], ["**", { bold: true }], ["__", { bold: true }],
    ["~~", { strikethrough: true }], ["*", { italic: true }], ["_", { italic: true }],
  ];
  for (const [marker, f] of table) {
    d = matchDelimited(chars, i, marker);
    if (d) return { spans: applying(spans(d.content), f), next: d.next };
  }
  return null;
}

function matchDelimited(chars: string[], i: number, marker: string): { content: string; next: number } | null {
  const m = Array.from(marker);
  const len = m.length;
  if (i + len > chars.length) return null;
  for (let k = 0; k < len; k++) if (chars[i + k] !== m[k]) return null;
  for (let j = i + len; j + len <= chars.length; j++) {
    let ok = true;
    for (let k = 0; k < len; k++) if (chars[j + k] !== m[k]) { ok = false; break; }
    if (ok) {
      if (j <= i + len) return null;
      return { content: chars.slice(i + len, j).join(""), next: j + len };
    }
  }
  return null;
}

function matchLink(chars: string[], i: number): { span: RichTextSpan; next: number } | null {
  if (chars[i] !== "[") return null;
  const close = chars.indexOf("]", i + 1);
  if (close < 0 || chars[close + 1] !== "(") return null;
  const paren = chars.indexOf(")", close + 2);
  if (paren < 0) return null;
  const label = chars.slice(i + 1, close).join("");
  const url = chars.slice(close + 2, paren).join("");
  if (url === "" || /\s/.test(url)) return null;
  return { span: span(label, { link: url }), next: paren + 1 };
}
