import type { Node as PMNode, ResolvedPos } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import { hasText, kindTag, type ParagraphKind } from "../domain/markdown/paragraphKind";
import { blockType, blockAttrs, kindOf } from "./schema";

export const textKind = (n: PMNode): boolean => hasText(kindOf(n));

export function setKind(tr: Transaction, pos: number, kind: ParagraphKind): Transaction {
  return tr.setNodeAttribute(pos, "kind", kindTag(kind));
}

/** Fresh attrs for a new block next to `node` (new local id, no Notion id). */
export const freshAttrs = (kind: ParagraphKind, depth: number): Record<string, unknown> => blockAttrs({ kind, depth });

/** The block around `$pos` (depth 1 in the flat doc). */
export function blockOf($pos: ResolvedPos): { node: PMNode; pos: number } {
  return { node: $pos.node(1), pos: $pos.before(1) };
}

export function newEmptyBlock(kind: ParagraphKind, depth: number): PMNode {
  return blockType.create(freshAttrs(kind, depth));
}

/** Continuation kind after Enter (EC L164-244). */
export function continuation(kind: ParagraphKind): ParagraphKind {
  switch (kind.t) {
    case "toDo": return { t: "toDo", checked: false };
    case "bulleted": case "numbered": case "quote": case "toggle": return kind;
    default: return { t: "paragraph" };
  }
}

export const isTextKindState = (state: EditorState): boolean => textKind(blockOf(state.selection.$from).node);
