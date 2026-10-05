/** Just enough Markdown for the legal files: headings, bullets, numbered lines, tables, inline styles (LegalBlock in LegalDocument.swift). */
export type Inline =
  | { t: "text"; text: string }
  | { t: "bold" | "italic" | "code"; text: string }
  | { t: "link"; text: string; href: string };

export type LegalBlock =
  | { kind: "heading"; level: number; spans: Inline[] }
  | { kind: "body"; spans: Inline[] }
  | { kind: "bullet"; spans: Inline[] };

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])_(.+?)_(?![\w*])|(?<![\w*])\*(?!\*)(.+?)\*(?!\*)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", text: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", text: m[1] });
    else if (m[2] !== undefined) out.push({ t: "code", text: m[2] });
    else if (m[3] !== undefined && m[4] !== undefined) out.push({ t: "link", text: m[3], href: m[4] });
    else out.push({ t: "italic", text: m[5] ?? m[6] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", text: src.slice(last) });
  return out;
}

export function parseLegal(markdown: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c !== "");
      if (cells.every((c) => /^[-: ]+$/.test(c))) continue;
      blocks.push({ kind: "bullet", spans: parseInline(cells.join(" · ")) });
    } else if (line.startsWith("#")) {
      const level = line.length - line.replace(/^#+/, "").length;
      blocks.push({ kind: "heading", level, spans: parseInline(line.replace(/^#+\s*/, "")) });
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      blocks.push({ kind: "bullet", spans: parseInline(line.slice(2)) });
    } else {
      blocks.push({ kind: "body", spans: parseInline(line) });
    }
  }
  return blocks;
}
