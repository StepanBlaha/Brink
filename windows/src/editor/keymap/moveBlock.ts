import { Fragment } from "prosemirror-model";
import { TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import type { Command } from "prosemirror-state";
import { maxDepthForMove, moveDownTarget, moveUpTarget, planMove } from "../../domain/editor/blockMoves";

const depths = (state: EditorState): { depth: number }[] =>
  Array.from({ length: state.doc.childCount }, (_, i) => ({ depth: state.doc.child(i).attrs["depth"] as number }));

/** The deepest depth a drop before block `before` may take (EditorCommands+Blocks.maxDepthForMove). */
export const maxDepthFor = (state: EditorState, at: number, before: number): number => maxDepthForMove(depths(state), at, before);

/**
 * Moves block `at` with its children so it sits before block `before` (`childCount` = the end) at
 * `depth`. Nodes keep their attrs, so ids survive and the planner sees a move. Null if invalid.
 */
export function moveBlockTr(state: EditorState, at: number, before: number, depth: number): Transaction | null {
  const plan = planMove(depths(state), at, before, depth);
  if (!plan) return null;
  const doc = state.doc;
  const offsets: number[] = [];
  let acc = 0;
  doc.forEach((n) => { offsets.push(acc); acc += n.nodeSize; });
  const from = offsets[plan.lo]!;
  const to = offsets[plan.hi]! + doc.child(plan.hi).nodeSize;
  const moved = plan.order.map((i) => {
    const n = doc.child(i);
    const d = plan.depths.get(i);
    return d === undefined || d === n.attrs["depth"] ? n : n.type.create({ ...n.attrs, depth: d }, n.content, n.marks);
  });
  const { $from } = state.selection;
  const selIndex = $from.index(0);
  const selOffset = $from.parentOffset;
  const tr = state.tr.replaceWith(from, to, Fragment.from(moved));
  const at2 = plan.order.indexOf(selIndex);
  if (at2 >= 0) {
    let pos = from;
    for (let k = 0; k < at2; k++) pos += moved[k]!.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, pos + 1 + Math.min(selOffset, moved[at2]!.content.size)));
  }
  return tr.scrollIntoView();
}

const apply = (target: { target: number; depth: number } | null, state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
  if (!target) return false;
  const tr = moveBlockTr(state, state.selection.$from.index(0), target.target, target.depth);
  if (!tr) return false;
  dispatch?.(tr);
  return true;
};

/** Alt+Shift+Up (EC+Blocks): before the nearest previous block of equal or lower depth. */
export const moveBlockUp: Command = (state, dispatch) =>
  apply(moveUpTarget(depths(state), state.selection.$from.index(0)), state, dispatch);

/** Alt+Shift+Down: after the next block's subtree. */
export const moveBlockDown: Command = (state, dispatch) =>
  apply(moveDownTarget(depths(state), state.selection.$from.index(0)), state, dispatch);
