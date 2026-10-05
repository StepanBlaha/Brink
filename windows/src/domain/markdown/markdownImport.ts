import type { RichTextSpan } from "../notion/richText";
import { numbers } from "./listNumbering";
import { parse, maxDepth, normalizeLanguage, render } from "./paragraphSyntax";
import { K, imageSourceUrl, parseImageSource, type ParagraphKind } from "./paragraphKind";
import { markdown } from "./markdownSerializer";
import { normalize, spansFromContent } from "./spanRuns";

export interface ImportedBlock {
  kind: ParagraphKind;
  depth: number;
  spans: RichTextSpan[];
}

const plain = (text: string): RichTextSpan => ({ text, bold: false, italic: false, strikethrough: false, code: false });

/** Splits pasted Markdown into blocks (prefixes, tabs / 2-space groups as depth, fenced code). */
export function importBlocks(text: string): ImportedBlock[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: ImportedBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    let line = lines[i]!;
    let depth = 0;
    for (;;) {
      if (line.startsWith("\t")) { line = line.slice(1); depth++; }
      else if (line.startsWith("  ")) { line = line.slice(2); depth++; }
      else break;
    }
    depth = Math.min(depth, maxDepth);
    if (line.startsWith("```")) {
      const language = normalizeLanguage(line.slice(3));
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) { code.push(lines[i]!); i++; }
      i++;
      const body = code.join("\n");
      out.push({ kind: K.code(language), depth, spans: body === "" ? [] : [plain(body)] });
      continue;
    }
    const parsed = parse(line);
    out.push({ kind: parsed.kind, depth, spans: spansFromContent(parsed.content, parsed.kind) });
    i++;
  }
  return out;
}

/** Markdown for copied paragraphs (plain text on the clipboard). */
export function exportMarkdown(paragraphs: { kind: ParagraphKind; depth: number; spans: RichTextSpan[] }[]): string {
  const nums = numbers(paragraphs.map((p) => ({ kind: p.kind, depth: p.depth })));
  return paragraphs.map((p, index) => {
    const indent = "  ".repeat(p.depth);
    switch (p.kind.t) {
      case "code":
        return `${indent}\`\`\`\n${p.spans.map((s) => s.text).join("")}\n${indent}\`\`\``;
      case "token":
        return indent + p.kind.title;
      case "image":
        return `${indent}![image](${imageSourceUrl(parseImageSource(p.kind.source)) ?? ""})`;
      default: {
        const body = markdown(normalize(p.spans)).split("\n").join(`  \n${indent}`);
        return indent + render(p.kind, "", 0, nums[index] ?? 1) + body;
      }
    }
  }).join("\n");
}
