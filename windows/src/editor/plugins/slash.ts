import { Plugin, PluginKey, TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { K } from "../../domain/markdown/paragraphKind";
import { matching, slashKind, type SlashCommand } from "../../domain/markdown/slashCommand";
import { isCodeKind, kindOf } from "../schema";
import { newEmptyBlock, setKind, textKind } from "../blockOps";

export interface SlashState { open: boolean; anchor: number; query: string; index: number }
const closed: SlashState = { open: false, anchor: 0, query: "", index: 0 };
type Meta = { open: number } | { close: true } | { index: number };

export const slashKey = new PluginKey<SlashState>("brinkSlash");
export const slashMatches = (s: SlashState): SlashCommand[] => matching(s.query);

function validate(prev: SlashState, state: EditorState, anchor: number, index: number): SlashState {
  const sel = state.selection;
  if (!sel.empty || anchor + 1 > state.doc.content.size) return closed;
  const $a = state.doc.resolve(anchor);
  if ($a.depth < 1 || sel.$from.depth < 1 || $a.before(1) !== sel.$from.before(1)) return closed;
  if (sel.from < anchor + 1 || state.doc.textBetween(anchor, anchor + 1) !== "/") return closed;
  const query = state.doc.textBetween(anchor + 1, sel.from);
  if (matching(query).length === 0 && (query.endsWith(" ") || query.length > 12)) return closed;
  const count = Math.max(matching(query).length, 1);
  return { open: true, anchor, query, index: query === prev.query ? Math.min(index, count - 1) : 0 };
}

export function applySlash(view: EditorView, command: SlashCommand): void {
  const s = slashKey.getState(view.state);
  if (!s?.open) return;
  const { state } = view;
  const $from = state.selection.$from;
  const block = $from.node(1);
  const pos = $from.before(1);
  const tr = state.tr.delete(s.anchor, state.selection.from);
  const kind = slashKind(command, kindOf(block));
  const depth = block.attrs["depth"] as number;
  if (kind.t === "divider") {
    const empty = tr.doc.nodeAt(pos)!.content.size === 0;
    const nodes = empty ? [newEmptyBlock(K.paragraph, depth)] : [newEmptyBlock(K.divider, depth), newEmptyBlock(K.paragraph, depth)];
    if (empty) setKind(tr, pos, K.divider);
    const after = pos + tr.doc.nodeAt(pos)!.nodeSize;
    tr.insert(after, nodes);
    tr.setSelection(TextSelection.create(tr.doc, after + nodes.reduce((a, n) => a + n.nodeSize, 0) - nodes[nodes.length - 1]!.nodeSize + 1));
  } else setKind(tr, pos, kind);
  view.dispatch(tr.setMeta(slashKey, { close: true } satisfies Meta).scrollIntoView());
  view.focus();
}

export const slashPlugin = (): Plugin<SlashState> =>
  new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => closed,
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(slashKey) as Meta | undefined;
        if (meta && "open" in meta) return validate(closed, state, meta.open, 0);
        if (meta && "close" in meta) return closed;
        if (!prev.open) return prev;
        if (meta && "index" in meta) return { ...prev, index: meta.index };
        return validate(prev, state, tr.mapping.map(prev.anchor, -1), prev.index);
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== "/" || from !== to) return false;
        const $from = view.state.doc.resolve(from);
        const block = $from.node(1);
        if (!textKind(block) || isCodeKind(block)) return false;
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
        if (before !== "" && !/\s$/.test(before)) return false;
        view.dispatch(view.state.tr.insertText("/", from, to).setMeta(slashKey, { open: from } satisfies Meta));
        return true;
      },
      handleKeyDown(view, e) {
        const s = slashKey.getState(view.state);
        if (!s?.open) return false;
        const list = slashMatches(s);
        const set = (index: number) => view.dispatch(view.state.tr.setMeta(slashKey, { index } satisfies Meta));
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (list.length) set((s.index + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length);
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          const c = list[s.index];
          if (c) applySlash(view, c);
          return true;
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          view.dispatch(view.state.tr.setMeta(slashKey, { close: true } satisfies Meta));
          return true;
        }
        return false;
      },
    },
  });
