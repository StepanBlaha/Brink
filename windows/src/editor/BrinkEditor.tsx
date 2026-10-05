import { useEffect, useReducer, useRef, useState } from "react";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import type { BrinkDoc } from "./docPort";
import { tokenChipView } from "./nodeViews/TokenChip";
import { applySlash, slashKey, slashMatches } from "./plugins/slash";
import { SlashMenu } from "./SlashMenu";
import "./editor.css";
import styles from "./editor.module.css";

interface Props {
  doc: BrinkDoc;
  fontScale?: number;
  onOpenToken?: (blockId: string) => void;
  /** True while the slash menu is open, so the panel does not fold on Esc. */
  onOverlay?: (open: boolean) => void;
}

/** The page editor: mounts the ProseMirror view for a `BrinkDoc` and the slash menu (PORT 3.c.1). */
export function BrinkEditor({ doc, fontScale = 1, onOpenToken, onOverlay }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [box, setBox] = useState({ x: 0, y: 0, h: 18, ch: 400 });
  const openToken = useRef(onOpenToken);
  openToken.current = onOpenToken;

  useEffect(() => {
    const view = new EditorView(host.current!, {
      state: doc.state,
      dispatchTransaction: doc.dispatch,
      nodeViews: { chip: tokenChipView((id) => openToken.current?.(id)) },
      attributes: { class: "brink-pm", spellcheck: "false", "aria-label": "Page editor" },
    });
    viewRef.current = view;
    doc.view = view;
    if (import.meta.env.DEV) (window as unknown as { __brink: unknown }).__brink = { doc, view };
    const sub = () => tick();
    doc.listeners.add(sub);
    return () => { doc.listeners.delete(sub); doc.view = null; view.destroy(); viewRef.current = null; };
  }, [doc]);

  const slash = slashKey.getState(doc.state);
  const open = slash?.open ?? false;
  useEffect(() => onOverlay?.(open), [open, onOverlay]);
  useEffect(() => {
    const view = viewRef.current;
    const w = wrap.current;
    if (!open || !view || !w || !slash) return;
    try {
      const c = view.coordsAtPos(slash.anchor);
      const r = w.getBoundingClientRect();
      setBox({ x: c.left - r.left, y: c.top - r.top, h: c.bottom - c.top, ch: r.height });
    } catch { /* no layout (tests) */ }
  }, [open, slash?.anchor, slash?.query]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusEnd = () => {
    const v = viewRef.current;
    if (!v || v.hasFocus()) return;
    v.focus();
    v.dispatch(v.state.tr.setSelection(TextSelection.atEnd(v.state.doc)));
  };

  return (
    <div ref={wrap} className={styles.wrap} style={{ fontSize: 14 * fontScale }} onMouseDown={(e) => { if (e.target === e.currentTarget || e.target === host.current) { e.preventDefault(); focusEnd(); } }}>
      <div ref={host} className={styles.host} />
      {open && slash ? (
        <SlashMenu
          items={slashMatches(slash)} index={slash.index} anchor={box} containerHeight={box.ch}
          onHover={(i) => viewRef.current?.dispatch(viewRef.current.state.tr.setMeta(slashKey, { index: i }))}
          onPick={(c) => viewRef.current && applySlash(viewRef.current, c)}
        />
      ) : null}
    </div>
  );
}
