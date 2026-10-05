import type { Block, BlockType } from "../notion/block";
import type { RichTextSpan } from "../notion/richText";

function serialize(s: RichTextSpan): string {
  let text = s.text;
  if (s.code) text = `\`${text}\``;
  else if (s.link !== undefined) text = `[${text}](${s.link})`;
  if (s.bold && s.italic) text = `***${text}***`;
  else if (s.bold) text = `**${text}**`;
  else if (s.italic) text = `*${text}*`;
  if (s.strikethrough) text = `~~${text}~~`;
  return text;
}

/** Spans back to inline Markdown. */
export function markdown(spans: RichTextSpan[]): string {
  return spans.map(serialize).join("");
}

/** The Markdown line prefix for a block type. */
export function prefixFor(type: BlockType): string {
  switch (type.kind) {
    case "heading1": return "# ";
    case "heading2": return "## ";
    case "heading3": return "### ";
    case "toDo": return type.checked ? "- [x] " : "- [ ] ";
    case "bulletedListItem": return "- ";
    case "numberedListItem": return "1. ";
    case "quote": return "> ";
    case "divider": return "---";
    default: return "";
  }
}

export function markdownForBlock(block: Block): string {
  return prefixFor(block.type) + markdown(block.richText);
}
