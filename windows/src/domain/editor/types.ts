import type { RichTextSpan } from "../notion/richText";
import { key, normalize, spansFromContent } from "../markdown/spanRuns";
import type { ParagraphKind } from "../markdown/paragraphKind";

/** One paragraph of the editor as it is now (the "current" side of a plan). */
export interface DocParagraph {
  /** Editor-local identity, stable while the paragraph exists. */
  localId: string;
  /** The Notion block this paragraph is, or null if it does not exist in Notion yet. */
  blockId: string | null;
  kind: ParagraphKind;
  /** Comparison key of the rich text (SpanRuns.key). */
  content: string;
  depth: number;
  /** Rich text built from the paragraph, what gets sent to Notion. */
  spans: RichTextSpan[];
}

let counter = 0;
export const newLocalId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export interface DocInit {
  localId?: string;
  blockId?: string | null;
  kind: ParagraphKind;
  depth?: number;
}

/** From inline Markdown `content` (tests, imports). */
export function docParagraph(o: DocInit & { content: string }): DocParagraph {
  return docParagraphFromSpans({ ...o, spans: spansFromContent(o.content, o.kind) });
}

export function docParagraphFromSpans(o: DocInit & { spans: RichTextSpan[] }): DocParagraph {
  return {
    localId: o.localId ?? newLocalId(),
    blockId: o.blockId ?? null,
    kind: o.kind,
    content: key(o.spans, o.kind),
    depth: o.depth ?? 0,
    spans: normalize(o.spans),
  };
}

/** One block of the last server-confirmed page state, in pre-order. */
export interface SyncedParagraph {
  blockId: string;
  /** Null = a top-level block of the page. */
  parentId: string | null;
  kind: ParagraphKind;
  content: string;
  spans: RichTextSpan[];
  /** The block has children the editor does not show; it is never recreated. */
  hasHiddenChildren: boolean;
}

export function syncedParagraph(o: {
  blockId: string; parentId?: string | null; kind: ParagraphKind; content?: string; spans?: RichTextSpan[]; hasHiddenChildren?: boolean;
}): SyncedParagraph {
  const spans = o.spans ?? spansFromContent(o.content ?? "", o.kind);
  return {
    blockId: o.blockId,
    parentId: o.parentId ?? null,
    kind: o.kind,
    content: key(spans, o.kind),
    spans: normalize(spans),
    hasHiddenChildren: o.hasHiddenChildren ?? false,
  };
}

/** Replaces kind and rich text after a confirmed update. */
export function withContent(p: SyncedParagraph, kind: ParagraphKind, spans: RichTextSpan[]): SyncedParagraph {
  return { ...p, kind, spans: normalize(spans), content: key(spans, kind) };
}

export type InsertParent = { t: "page" } | { t: "block"; id: string } | { t: "pending"; localId: string };
export type InsertPosition = { t: "start" } | { t: "after"; blockId: string } | { t: "afterPending"; localId: string };

export type EditorSyncOp =
  | { t: "update"; blockId: string; kind: ParagraphKind; content: string }
  | { t: "insert"; parent: InsertParent; position: InsertPosition; paragraphs: DocParagraph[] }
  | { t: "delete"; blockId: string }
  | { t: "restoreToken"; token: SyncedParagraph; depth: number; afterBlockId: string | null };
