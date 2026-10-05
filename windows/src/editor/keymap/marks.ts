import { toggleMark } from "prosemirror-commands";
import type { Command } from "prosemirror-state";
import { schema, isCodeKind } from "../schema";

/** Remove when every run has the mark, else add (EC L359-401); disabled in code blocks. */
export function toggle(name: "bold" | "italic" | "code" | "strike"): Command {
  const type = schema.marks[name]!;
  return (state, dispatch) => {
    if (isCodeKind(state.selection.$from.node(1))) return true;
    const { from, to, empty } = state.selection;
    if (empty) return toggleMark(type)(state, dispatch);
    let all = true;
    state.doc.nodesBetween(from, to, (n) => { if (n.isInline && !n.marks.some((m) => m.type === type)) all = false; });
    if (dispatch) {
      const tr = state.tr;
      if (all) tr.removeMark(from, to, type); else tr.addMark(from, to, type.create());
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}
