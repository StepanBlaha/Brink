import type { NewBlock } from "../notion/newBlock";
import type { RichTextSpan } from "../notion/richText";
import { blocks, detectPrefixedBlock, spans } from "../markdown/markdownParser";

/**
 * What capture and clipboard need from the Markdown parser. The implementation is the editor's
 * shared `domain/markdown/markdownParser`, so capture and the editor parse identically.
 */
export interface MarkdownPort {
  blocks(markdown: string): NewBlock[];
  detectPrefixedBlock(line: string): NewBlock | null;
  spans(text: string): RichTextSpan[];
}

export { blocks, detectPrefixedBlock, spans };

export const captureMarkdown: MarkdownPort = { blocks, detectPrefixedBlock, spans };
