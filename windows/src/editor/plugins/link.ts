import { Plugin, type EditorState, type Transaction } from "prosemirror-state";
import { schema } from "../schema";

/** `example.com` becomes `https://example.com`; empty means remove the link (EditorTextView+Paste). */
export function normalizeLink(input: string): string | null {
  const t = input.trim();
  if (t === "") return null;
  return t.includes("://") ? t : `https://${t}`;
}

/** The link under a non-empty selection, for the popover's initial value. */
export function linkAt(state: EditorState): string {
  const { from, to } = state.selection;
  let href = "";
  state.doc.nodesBetween(from, from === to ? to : from + 1, (n) => {
    const m = n.marks.find((x) => x.type === schema.marks["link"]);
    if (m && href === "") href = m.attrs["href"] as string;
  });
  return href;
}

export function setLink(state: EditorState, from: number, to: number, url: string | null): Transaction {
  const type = schema.marks["link"]!;
  const tr = state.tr.removeMark(from, to, type);
  if (url !== null) tr.addMark(from, to, type.create({ href: url }));
  return tr;
}

/** Ctrl+click on a link opens it (Mac: Command+click). */
export const linkClickPlugin = (open: (url: string) => void): Plugin =>
  new Plugin({
    props: {
      handleClick(view, pos, event) {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const mark = view.state.doc.resolve(pos).marks().find((m) => m.type === schema.marks["link"])
          ?? view.state.doc.nodeAt(pos)?.marks.find((m) => m.type === schema.marks["link"]);
        if (!mark) return false;
        open(mark.attrs["href"] as string);
        return true;
      },
    },
  });
