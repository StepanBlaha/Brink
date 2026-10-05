import { TextSelection, type Command } from "prosemirror-state";
import { maxDepth } from "../../domain/markdown/paragraphSyntax";
import { isCodeKind } from "../schema";

function change(dir: 1 | -1): Command {
  return (state, dispatch) => {
    const { $from, $to } = state.selection;
    if (dir === 1 && isCodeKind($from.node(1))) {
      if (dispatch) dispatch(state.tr.insertText("\t").scrollIntoView());
      return true;
    }
    const tr = state.tr;
    const first = $from.index(0);
    const last = $to.index(0);
    const depths: number[] = [];
    state.doc.forEach((n) => depths.push(n.attrs["depth"] as number));
    let pos = 0;
    state.doc.forEach((_n, offset, i) => {
      pos = offset;
      if (i < first || i > last) return;
      const d = depths[i]!;
      const prev = i === 0 ? -1 : depths[i - 1]!;
      if (dir === 1 && d < maxDepth && d <= prev) { depths[i] = d + 1; tr.setNodeAttribute(pos, "depth", d + 1); }
      if (dir === -1 && d > 0) { depths[i] = d - 1; tr.setNodeAttribute(pos, "depth", d - 1); }
    });
    if (dispatch) dispatch(tr.setSelection(TextSelection.create(tr.doc, state.selection.anchor, state.selection.head)));
    return true;
  };
}

export const indent = change(1);
export const outdent = change(-1);
