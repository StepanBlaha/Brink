import { Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { maxDepth } from "../../domain/markdown/paragraphSyntax";
import { maxDepthFor, moveBlockTr } from "../keymap/moveBlock";

/** Pointer travel before a press on the handle becomes a drag (ETV+BlockDrag). */
export const dragThreshold = 3;
export const indentWidth = 24;
const gutterX = 30;

/** First visible block whose vertical midpoint is below `y`; `mids.length` (the end) if none. Hidden blocks are null. */
export function dropIndex(mids: (number | null)[], y: number): number {
  for (let i = 0; i < mids.length; i++) {
    const m = mids[i];
    if (m !== null && m !== undefined && m > y) return i;
  }
  return mids.length;
}

/** Depth after dragging by `dx`: source depth plus round(dx / 24), clamped to `0...max`. */
export function dropDepth(sourceDepth: number, dx: number, max: number): number {
  return Math.max(0, Math.min(sourceDepth + Math.round(dx / indentWidth), Math.min(max, maxDepth)));
}

const dots = '<svg width="14" height="20" viewBox="0 0 14 20" aria-hidden="true"><g fill="currentColor">' +
  [4.5, 8.5, 12.5].flatMap((y) => [4.75, 9.25].map((x) => `<circle cx="${x}" cy="${y + 1}" r="1.25"/>`)).join("") + "</g></svg>";

function blockEls(view: EditorView): (HTMLElement | null)[] {
  const out: (HTMLElement | null)[] = [];
  view.state.doc.forEach((_n, pos) => { out.push(view.nodeDOM(pos) as HTMLElement | null); });
  return out;
}

/** The ⋮⋮ handle and drop indicator, driven by pointer events (not HTML5 DnD; PORT 3.c.8). */
export const dragHandlePlugin = (): Plugin =>
  new Plugin({
    view(view) {
      const root = (view.dom.parentElement ?? view.dom) as HTMLElement;
      const handle = document.createElement("div");
      handle.className = "brink-handle";
      handle.contentEditable = "false";
      handle.innerHTML = dots;
      handle.hidden = true;
      const line = document.createElement("div");
      line.className = "brink-drop";
      line.hidden = true;
      line.innerHTML = '<i class="dot"></i>';
      root.append(handle, line);
      let hover = -1;
      let drag: { index: number; x0: number; y0: number; on: boolean; before: number; depth: number } | null = null;

      const rel = () => root.getBoundingClientRect();
      const showHandle = (index: number) => {
        const el = blockEls(view)[index];
        if (!el || !view.editable) { handle.hidden = true; return; }
        hover = index;
        const r = el.getBoundingClientRect();
        const d = Number(el.getAttribute("data-depth") ?? 0);
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
        handle.style.left = `${gutterX + d * indentWidth - 18}px`;
        handle.style.top = `${r.top - rel().top + Math.max(0, (lh - 20) / 2)}px`;
        handle.hidden = false;
      };
      const move = (e: PointerEvent) => {
        if (drag) return;
        const els = blockEls(view);
        const i = els.findIndex((el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && e.clientY >= r.top - 2 && e.clientY < r.bottom + 2; });
        if (i >= 0) showHandle(i); else if (!handle.contains(e.target as Node)) handle.hidden = true;
      };
      const leave = (e: PointerEvent) => { if (!drag && !root.contains(e.relatedTarget as Node | null)) handle.hidden = true; };

      const target = (e: PointerEvent): { before: number; depth: number } => {
        const els = blockEls(view);
        const mids = els.map((el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.height > 0 ? (r.top + r.bottom) / 2 : null; });
        const before = dropIndex(mids, e.clientY);
        const src = view.state.doc.child(drag!.index).attrs["depth"] as number;
        const depth = dropDepth(src, e.clientX - drag!.x0, maxDepthFor(view.state, drag!.index, before));
        return { before, depth };
      };
      const drawLine = (before: number, depth: number) => {
        const els = blockEls(view);
        const ref = before < els.length ? els[before] : els[els.length - 1];
        if (!ref) return;
        const r = ref.getBoundingClientRect();
        const y = (before < els.length ? r.top : r.bottom) - rel().top;
        line.style.top = `${y - 1}px`;
        line.style.left = `${gutterX + depth * indentWidth}px`;
        line.hidden = false;
      };
      const onMove = (e: PointerEvent) => {
        if (!drag) return;
        if (!drag.on) {
          if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < dragThreshold) return;
          drag.on = true;
          handle.classList.add("dragging");
          root.classList.add("dragging");
        }
        const t = target(e);
        drag.before = t.before;
        drag.depth = t.depth;
        drawLine(t.before, t.depth);
      };
      const finish = (commit: boolean) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        const d = drag;
        drag = null;
        handle.classList.remove("dragging");
        root.classList.remove("dragging");
        line.hidden = true;
        if (!d || !commit) return;
        if (!d.on) { // a plain click selects the block's content
          const el = blockEls(view)[d.index];
          const pos = el ? view.posAtDOM(el, 0) : null;
          const node = view.state.doc.child(d.index);
          if (pos !== null) {
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, pos + node.content.size)));
            view.focus();
          }
          return;
        }
        const tr = moveBlockTr(view.state, d.index, d.before, d.depth);
        if (tr) view.dispatch(tr);
        hover = -1;
      };
      const onUp = () => finish(true);
      const onCancel = () => finish(false);
      handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || hover < 0) return;
        e.preventDefault();
        drag = { index: hover, x0: e.clientX, y0: e.clientY, on: false, before: hover, depth: 0 };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
      });
      root.addEventListener("pointermove", move);
      root.addEventListener("pointerleave", leave);
      return {
        update: () => { if (hover >= view.state.doc.childCount) { hover = -1; handle.hidden = true; } },
        destroy: () => {
          finish(false);
          root.removeEventListener("pointermove", move);
          root.removeEventListener("pointerleave", leave);
          handle.remove(); line.remove();
        },
      };
    },
  });
