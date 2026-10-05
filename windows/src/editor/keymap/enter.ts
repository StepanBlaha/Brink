import { TextSelection, type Command } from "prosemirror-state";
import { K, type ParagraphKind } from "../../domain/markdown/paragraphKind";
import { blockOf, continuation, freshAttrs, newEmptyBlock, setKind } from "../blockOps";
import { blockType, kindOf } from "../schema";

const resetable = new Set(["bulleted", "numbered", "toDo", "quote", "toggle", "callout"]);

/** Enter (EC L164-244). */
export const enterCommand: Command = (state, dispatch) => {
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const $from = tr.selection.$from;
  const { node, pos } = blockOf($from);
  const kind = kindOf(node);
  const depth = node.attrs["depth"] as number;
  const end = pos + node.nodeSize;
  const atStart = $from.parentOffset === 0;
  const atEnd = $from.parentOffset === node.content.size;
  const below = (k: ParagraphKind, d = depth) => {
    const at = pos + tr.doc.nodeAt(pos)!.nodeSize;
    tr.insert(at, newEmptyBlock(k, d));
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
  };
  const text = node.textContent;
  if (kind.t === "token" || kind.t === "image") {
    if (atStart && node.content.size > 0) {
      tr.insert(pos, newEmptyBlock(K.paragraph, depth));
      tr.setSelection(TextSelection.create(tr.doc, end + 1));
    } else below(K.paragraph);
  } else if (kind.t === "divider") below(K.paragraph);
  else if (kind.t === "code") {
    const last = node.lastChild;
    if (atEnd && last?.type.name === "hard_break") {
      tr.delete(end - 2, end - 1);
      below(K.paragraph);
    } else tr.replaceSelectionWith(state.schema.nodes["hard_break"]!.create()).scrollIntoView();
  } else if (text === "---" && atEnd && node.childCount === 1) {
    tr.delete(pos + 1, end - 1);
    setKind(tr, pos, K.divider);
    below(K.paragraph);
  } else if (node.content.size === 0 && resetable.has(kind.t)) {
    setKind(tr, pos, K.paragraph);
  } else if (kind.t === "toggle" && atEnd && !node.attrs["collapsed"]) {
    below(K.paragraph, Math.min(depth + 1, 3));
  } else if (atStart && node.content.size > 0) {
    const above = newEmptyBlock(continuation(kind), depth);
    tr.insert(pos, above);
    tr.setSelection(TextSelection.create(tr.doc, $from.pos + above.nodeSize));
  } else {
    tr.split($from.pos, 1, [{ type: blockType, attrs: freshAttrs(continuation(kind), depth) }]);
  }
  tr.scrollIntoView();
  dispatch?.(tr);
  return true;
};

/** Shift+Enter: soft line break. */
export const softBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(state.schema.nodes["hard_break"]!.create()).scrollIntoView());
  return true;
};
