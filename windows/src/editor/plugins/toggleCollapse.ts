import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { NON_EDIT } from "../identityPlugin";

/** Flips a toggle's local `collapsed` attribute: not an edit, not undoable, never synced. */
export function toggleCollapsed(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (!node) return;
  view.dispatch(view.state.tr.setNodeAttribute(pos, "collapsed", !node.attrs["collapsed"]).setMeta(NON_EDIT, true).setMeta("addToHistory", false));
}

/** Block indices hidden by collapsed toggles: the deeper blocks that follow. */
export function hiddenIndices(blocks: { kind: string; depth: number; collapsed: boolean }[]): Set<number> {
  const hidden = new Set<number>();
  blocks.forEach((b, i) => {
    if (b.kind !== "toggle" || !b.collapsed) return;
    for (let j = i + 1; j < blocks.length && blocks[j]!.depth > b.depth; j++) hidden.add(j);
  });
  return hidden;
}

export const toggleCollapsePlugin = (): Plugin =>
  new Plugin({
    props: {
      decorations(state) {
        const blocks: { kind: string; depth: number; collapsed: boolean; pos: number; size: number }[] = [];
        state.doc.forEach((n, pos) => blocks.push({ kind: n.attrs["kind"] as string, depth: n.attrs["depth"] as number, collapsed: n.attrs["collapsed"] as boolean, pos, size: n.nodeSize }));
        const hidden = hiddenIndices(blocks);
        if (hidden.size === 0) return null;
        return DecorationSet.create(state.doc, [...hidden].map((i) => Decoration.node(blocks[i]!.pos, blocks[i]!.pos + blocks[i]!.size, { class: "hidden" })));
      },
    },
  });
