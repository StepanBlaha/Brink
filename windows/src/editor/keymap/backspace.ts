import { NodeSelection, type Command } from "prosemirror-state";
import { K } from "../../domain/markdown/paragraphKind";
import { blockOf, setKind } from "../blockOps";
import { kindOf } from "../schema";

/** Backspace at the start of a block (EC L266-302); everything else falls through. */
export const backspaceCommand: Command = (state, dispatch) => {
  const sel = state.selection;
  if (!sel.empty || sel.$from.parentOffset !== 0) return false;
  const { node, pos } = blockOf(sel.$from);
  const kind = kindOf(node);
  const depth = node.attrs["depth"] as number;
  if (kind.t === "token") return false;
  if (kind.t !== "paragraph") {
    if (dispatch) dispatch(setKind(state.tr, pos, K.paragraph));
    return true;
  }
  if (depth > 0) {
    if (dispatch) dispatch(state.tr.setNodeAttribute(pos, "depth", depth - 1));
    return true;
  }
  if (pos === 0) return false;
  const prev = state.doc.resolve(pos - 1).node(1);
  const prevPos = pos - prev.nodeSize;
  const prevKind = kindOf(prev);
  if (prevKind.t === "divider") {
    if (dispatch) dispatch(state.tr.delete(prevPos, pos));
    return true;
  }
  if (prevKind.t === "token") return true;
  if (prevKind.t === "image") {
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, prevPos + 1)));
    return true;
  }
  if (dispatch) dispatch(state.tr.join(pos).scrollIntoView());
  return true;
};
