import { exportMarkdown } from "../markdown/markdownImport";
import type { SyncedParagraph } from "./types";

/** The last confirmed page content as Markdown (nesting from `parentId`, pre-order input). */
export function backupMarkdown(previous: SyncedParagraph[]): string {
  const depthOf = new Map<string, number>();
  const paragraphs = previous.map((p) => {
    const depth = p.parentId === null ? 0 : (depthOf.get(p.parentId) ?? 0) + 1;
    depthOf.set(p.blockId, depth);
    return { kind: p.kind, depth, spans: p.spans };
  });
  return exportMarkdown(paragraphs);
}
