import { Fragment, type Node as PMNode } from "prosemirror-model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { exportMarkdown, importBlocks } from "../../domain/markdown/markdownImport";
import { hasText, kindTag as kindTagOf } from "../../domain/markdown/paragraphKind";
import { blockFor, contentFor } from "../loadDocument";
import { isCodeKind, kindOf } from "../schema";
import { spansOfBlock } from "../snapshot";

/** Paste Markdown (EC L407-442): one history step, first block joins the current one. */
export function pasteMarkdown(state: EditorState, text: string): Transaction | null {
  const blocks = importBlocks(text);
  if (blocks.length === 0) return null;
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const $from = tr.selection.$from;
  const cur = $from.node(1);
  const pos = $from.before(1);
  const end = pos + cur.nodeSize;
  const kind = kindOf(cur);
  const depth = cur.attrs["depth"] as number;
  const atoms = (cur.attrs["kind"] as string);
  if (!hasText(kind) || atoms.startsWith("token")) {
    const nodes = blocks.map((b) => blockFor(b.kind, b.spans, { depth: Math.min(depth + b.depth, 3) }));
    tr.insert(end, nodes);
    return tr.setSelection(TextSelection.near(tr.doc.resolve(end + nodes[0]!.nodeSize - 1), -1)).scrollIntoView();
  }
  const lastBlock = blocks[blocks.length - 1]!;
  if ($from.parentOffset === 0 && cur.content.size > 0 && blocks.length > 1 && lastBlock.kind.t === "paragraph" && lastBlock.spans.length === 0) {
    // Text ending in a newline pasted at a line start: whole lines go above, the line keeps its identity.
    const above = blocks.slice(0, -1).map((b) => blockFor(b.kind, b.spans, { depth: Math.min(depth + b.depth, 3) }));
    tr.insert(pos, above);
    return tr.scrollIntoView();
  }
  const head = cur.content.cut(0, $from.parentOffset);
  const tail = cur.content.cut($from.parentOffset);
  if (isCodeKind(cur)) {
    const joined = blocks.map((b) => b.spans.map((s) => s.text).join("")).join("\n");
    const mid = contentFor(kind, [{ text: joined, bold: false, italic: false, strikethrough: false, code: false }]);
    return tr.replaceWith(pos + 1 + head.size, pos + 1 + head.size, mid).scrollIntoView();
  }
  const first = blocks[0]!;
  const takeKind = cur.content.size === 0 && kind.t === "paragraph";
  const firstKind = takeKind ? first.kind : kind;
  const last = blocks.length - 1;
  const nodes: PMNode[] = [];
  let caret = 0;
  blocks.forEach((b, i) => {
    const body = contentFor(i === 0 ? firstKind : b.kind, b.spans);
    const frag = Fragment.from(body);
    const withTail = i === last ? frag.append(tail) : frag;
    const joined = i === 0 ? head.append(withTail) : withTail;
    if (i === 0) {
      const node = cur.type.create({ ...cur.attrs, kind: kindTagOf(firstKind), depth: takeKind ? Math.min(first.depth + depth, 3) : depth }, joined);
      nodes.push(node);
    } else {
      nodes.push(blockFor(b.kind, [], { depth: Math.min(depth + b.depth, 3) }).copy(joined));
    }
    if (i === last) caret = nodes.reduce((a, n) => a + n.nodeSize, 0) - 1 - tail.size;
  });
  tr.replaceWith(pos, end, nodes);
  return tr.setSelection(TextSelection.create(tr.doc, pos + caret)).scrollIntoView();
}

export const pastePlugin = (): Plugin =>
  new Plugin({
    props: {
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false;
        const tr = pasteMarkdown(view.state, text);
        if (tr) view.dispatch(tr.setMeta("paste", true).setMeta("uiEvent", "paste"));
        return true;
      },
      clipboardTextSerializer(slice) {
        const ps: { kind: ReturnType<typeof kindOf>; depth: number; spans: ReturnType<typeof spansOfBlock> }[] = [];
        slice.content.forEach((b) => ps.push({ kind: kindOf(b), depth: b.attrs["depth"] as number, spans: spansOfBlock(b) }));
        return exportMarkdown(ps);
      },
    },
  });
