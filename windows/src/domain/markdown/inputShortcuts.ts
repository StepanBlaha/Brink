import { defaultCalloutIcon, K, type ParagraphKind } from "./paragraphKind";

/** Markdown typed at the very start of a paragraph converts it once the shortcut is complete. */
export function blockShortcutKind(typed: string, current: ParagraphKind): ParagraphKind | null {
  let target: ParagraphKind | null;
  switch (typed) {
    case "# ": target = K.heading1; break;
    case "## ": target = K.heading2; break;
    case "### ": target = K.heading3; break;
    case "- ": case "* ": target = K.bulleted; break;
    case "[] ": case "[ ] ": case "- [ ] ": target = K.toDo(false); break;
    case "[x] ": case "[X] ": case "- [x] ": target = K.toDo(true); break;
    case "> ": target = K.quote; break;
    case "+ ": target = K.toggle; break;
    case "!> ": target = K.callout(defaultCalloutIcon); break;
    case "```": target = K.code("plain text"); break;
    default:
      target = /^[0-9]+\. $/.test(typed) && typed.length >= 3 && typed.length <= 5 ? K.numbered : null;
  }
  if (!target) return null;
  if (current.t === "paragraph") return target;
  if (current.t === "bulleted" && target.t === "toDo") return target;
  return null;
}

export type InlineStyle = { t: "bold" | "italic" | "strikethrough" | "code" } | { t: "link"; url: string };

export interface InlineMatch {
  /** Whole marked-up run (markers included): [start, end) in UTF-16 units. */
  whole: [number, number];
  inner: [number, number];
  style: InlineStyle;
}

const isWordChar = (c: string): boolean => /[\p{L}\p{N}]/u.test(c);

/** A marked-up run ending exactly at the end of `text` (paragraph text up to the caret). */
export function inlineMatch(text: string): InlineMatch | null {
  const n = text.length;
  if (n < 3) return null;
  if (text[n - 1] === ")") {
    const m = /\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(text);
    if (!m) return null;
    const raw = m[2]!;
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw);
    if (!hasScheme && !raw.includes(".")) return null;
    const start = m.index;
    const labelStart = start + 1;
    return {
      whole: [start, n],
      inner: [labelStart, labelStart + m[1]!.length],
      style: { t: "link", url: hasScheme ? raw : `https://${raw}` },
    };
  }
  const pairs: [string, InlineStyle][] = [
    ["**", { t: "bold" }], ["~~", { t: "strikethrough" }], ["`", { t: "code" }], ["*", { t: "italic" }], ["_", { t: "italic" }],
  ];
  for (const [marker, style] of pairs) {
    const m = marker.length;
    if (n < 2 * m + 1 || text.slice(n - m) !== marker) continue;
    if (marker === "*" && n >= 2 && text[n - 2] === "*") continue;
    const innerEnd = n - m;
    if (innerEnd <= 0 || text[innerEnd - 1] === " ") continue;
    for (let i = innerEnd - m; i >= 0; i--) {
      if (text.slice(i, i + m) !== marker) continue;
      const innerStart = i + m;
      const valid = innerStart < innerEnd && text[innerStart] !== " " &&
        !(marker === "*" && ((i > 0 && text[i - 1] === "*") || text[innerStart] === "*")) &&
        !(marker === "_" && i > 0 && isWordChar(text[i - 1]!));
      if (valid) return { whole: [i, n], inner: [innerStart, innerEnd], style };
      break;
    }
  }
  return null;
}
