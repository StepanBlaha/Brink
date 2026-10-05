import { Fragment, type Node as PMNode } from "prosemirror-model";
import { maxDepth } from "../domain/markdown/paragraphSyntax";
import { imageSourceUrl, parseImageSource, type ParagraphKind } from "../domain/markdown/paragraphKind";
import type { SyncedParagraph } from "../domain/editor/types";
import type { RichTextSpan } from "../domain/notion/richText";
import { makeBlock, schema, type BlockInit } from "./schema";

const S = schema;

/** Inline content for spans of a block (hard breaks for "\n"; code gets no marks). */
export function spansToNodes(spans: RichTextSpan[], kind: ParagraphKind): PMNode[] {
  const out: PMNode[] = [];
  for (const sp of spans) {
    const marks = kind.t === "code" ? [] : [
      ...(sp.bold ? [S.marks["bold"]!.create()] : []),
      ...(sp.italic ? [S.marks["italic"]!.create()] : []),
      ...(sp.strikethrough ? [S.marks["strike"]!.create()] : []),
      ...(sp.underline ? [S.marks["underline"]!.create()] : []),
      ...(sp.code ? [S.marks["code"]!.create()] : []),
      ...(sp.link ? [S.marks["link"]!.create({ href: sp.link })] : []),
      ...(sp.color ? [S.marks["color"]!.create({ color: sp.color })] : []),
    ];
    sp.text.replace(/￼/g, "").split("\n").forEach((line, i) => {
      if (i > 0) out.push(S.nodes["hard_break"]!.create(null, null, marks));
      if (line !== "") out.push(S.text(line, marks));
    });
  }
  return out;
}

/** The inline content of a block of `kind` (chip / image atoms for the non-text kinds). */
export function contentFor(kind: ParagraphKind, spans: RichTextSpan[]): PMNode[] {
  switch (kind.t) {
    case "token": return [S.nodes["chip"]!.create({ type: kind.type, title: kind.title })];
    case "image": return [S.nodes["image"]!.create({ source: kind.source })];
    case "divider": return [];
    default: return spansToNodes(spans, kind);
  }
}

export function blockFor(kind: ParagraphKind, spans: RichTextSpan[], init: BlockInit = {}): PMNode {
  return makeBlock({ ...init, kind }, contentFor(kind, spans));
}

/** Whole-document rebuild from the server state: fresh local ids, depth from the parent chain. */
export function docFromSynced(synced: SyncedParagraph[]): PMNode {
  const depth = new Map<string, number>();
  const blocks = synced.map((b) => {
    const parent = b.parentId !== null ? depth.get(b.parentId) : undefined;
    const level = Math.min(parent !== undefined ? parent + 1 : 0, maxDepth);
    depth.set(b.blockId, level);
    return blockFor(b.kind, b.spans, { depth: level, blockId: b.blockId });
  });
  if (blocks.length === 0) blocks.push(makeBlock());
  return S.nodes["doc"]!.create(null, Fragment.from(blocks));
}

export { imageSourceUrl, parseImageSource };
