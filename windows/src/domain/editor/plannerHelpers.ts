import { K, type ParagraphKind } from "../markdown/paragraphKind";
import { docParagraph, syncedParagraph, type DocParagraph, type SyncedParagraph } from "./types";

/** Test helpers shared by the planner suites. */
export function s(blockId: string, content: string, kind: ParagraphKind = K.paragraph, o: { parent?: string; hidden?: boolean } = {}): SyncedParagraph {
  return syncedParagraph({ blockId, parentId: o.parent ?? null, kind, content, hasHiddenChildren: o.hidden ?? false });
}

let uid = 0;
export function d(blockId: string | null, content: string, kind: ParagraphKind = K.paragraph, o: { depth?: number; local?: string } = {}): DocParagraph {
  return docParagraph({ localId: o.local ?? (blockId !== null ? `L-${blockId}` : `U-${uid++}`), blockId, kind, content, depth: o.depth ?? 0 });
}

/** Previous state mirrored exactly as the current document (what a fresh load gives). */
export function unchanged(previous: SyncedParagraph[]): DocParagraph[] {
  const depth = new Map<string, number>();
  return previous.map((p) => {
    const parentDepth = p.parentId !== null ? depth.get(p.parentId) : undefined;
    const level = parentDepth !== undefined ? parentDepth + 1 : 0;
    depth.set(p.blockId, level);
    return d(p.blockId, p.content, p.kind, { depth: level });
  });
}

/** Sets content (and the derived spans) like the Swift tests mutate `current[i].content`. */
export function withContent(p: DocParagraph, content: string): DocParagraph {
  return docParagraph({ localId: p.localId, blockId: p.blockId, kind: p.kind, depth: p.depth, content });
}
