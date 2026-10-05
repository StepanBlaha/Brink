import { useEffect, useReducer, useRef, useState } from "react";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import type { BrinkDoc } from "./docPort";
import { FindBar } from "./FindBar";
import { listenFileDrops, readDroppedImages } from "./fileDrops";
import { LinkPopover } from "./LinkPopover";
import { imageEnvOf, imageView } from "./nodeViews/ImageBlock";
import { tokenChipView, type EmbedDatabase } from "./nodeViews/TokenChip";
import { findAction, findKey, findKeyAction } from "./plugins/find";
import { linkAt, normalizeLink, setLink } from "./plugins/link";
import { applySlash, slashKey, slashMatches } from "./plugins/slash";
import { SlashMenu } from "./SlashMenu";
import "./editor.css";
import styles from "./editor.module.css";

interface Props {
  doc: BrinkDoc;
  fontScale?: number;
  onOpenToken?: (blockId: string) => void;
  /** True while the slash menu, find bar or link popover is open, so the panel does not fold on Esc. */
  onOverlay?: (open: boolean) => void;
  /** Mounts the compact database under `child_database` chips. */
  embed?: EmbedDatabase;
  onError?: (message: string) => void;
}

interface LinkEdit { from: number; to: number; initial: string; x: number; y: number }

/** The page editor: mounts the ProseMirror view for a `BrinkDoc`, slash menu, find bar and link popover (PORT 3.c.1). */
export function BrinkEditor({ doc, fontScale = 1, onOpenToken, onOverlay, embed, onError }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [box, setBox] = useState({ x: 0, y: 0, h: 18, ch: 400 });
  const [link, setLinkEdit] = useState<LinkEdit | null>(null);
  const openToken = useRef(onOpenToken);
  openToken.current = onOpenToken;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const view = new EditorView(host.current!, {
      state: doc.state,
      dispatchTransaction: doc.dispatch,
      nodeViews: { chip: tokenChipView((id) => openToken.current?.(id), embed), image: imageView(imageEnvOf(doc)) },
      attributes: { class: "brink-pm", spellcheck: "false", "aria-label": "Page editor" },
    });
    viewRef.current = view;
    doc.view = view;
    if (import.meta.env.DEV) (window as unknown as { __brink: unknown }).__brink = { doc, view };
    const sub = () => tick();
    doc.listeners.add(sub);
    return () => { doc.listeners.delete(sub); doc.view = null; view.destroy(); viewRef.current = null; };
  }, [doc, embed]);

  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    void listenFileDrops((paths, x, y) => {
      void readDroppedImages(paths, (m) => errorRef.current?.(m)).then((files) => {
        const view = viewRef.current;
        if (!view || files.length === 0) return;
        let at: { pos: number } | null = null;
        try { at = view.posAtCoords({ left: x, top: y }); } catch { /* no layout */ }
        doc.onImages?.(files, at ? view.state.doc.resolve(at.pos).index(0) : view.state.doc.childCount - 1);
      });
    }).then((f) => { if (dead) f(); else off = f; }, () => undefined);
    return () => { dead = true; off?.(); };
  }, [doc]);

  const slash = slashKey.getState(doc.state);
  const find = findKey.getState(doc.state);
  const open = slash?.open ?? false;
  const findOpen = find?.open ?? false;
  useEffect(() => onOverlay?.(open || findOpen || link !== null), [open, findOpen, link, onOverlay]);
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
  const cur = find?.matches[find.current];
  useEffect(() => {
    const view = viewRef.current;
    if (!cur || !view) return;
    try { (view.domAtPos(cur.from).node as Node).parentElement?.scrollIntoView?.({ block: "nearest" }); } catch { /* no layout */ }
  }, [cur?.from, find?.query]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusEnd = () => {
    const v = viewRef.current;
    if (!v || v.hasFocus()) return;
    v.focus();
    v.dispatch(v.state.tr.setSelection(TextSelection.atEnd(v.state.doc)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const view = viewRef.current;
    if (!view) return;
    const f = findKeyAction(view, e.nativeEvent);
    if (f) { e.preventDefault(); view.dispatch(findAction(view.state.tr, f)); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !view.state.selection.empty) {
      e.preventDefault();
      const { from, to } = view.state.selection;
      try {
        const c = view.coordsAtPos(from);
        const r = wrap.current!.getBoundingClientRect();
        setLinkEdit({ from, to, initial: linkAt(view.state), x: Math.max(8, Math.min(c.left - r.left, r.width - 248)), y: c.bottom - r.top + wrap.current!.scrollTop + 4 });
      } catch { setLinkEdit({ from, to, initial: linkAt(view.state), x: 8, y: 8 }); }
    }
  };
  const endLink = () => { setLinkEdit(null); viewRef.current?.focus(); };

  return (
    <div ref={wrap} className={styles.wrap} style={{ fontSize: 14 * fontScale }} onKeyDown={onKeyDown} onMouseDown={(e) => { if (e.target === e.currentTarget || e.target === host.current) { e.preventDefault(); focusEnd(); } }}>
      {findOpen && find && viewRef.current ? <FindBar view={viewRef.current} find={find} /> : null}
      <div ref={host} className={styles.host} />
      {link ? (
        <LinkPopover
          initial={link.initial} x={link.x} y={link.y} onCancel={endLink}
          onSubmit={(v) => {
            const view = viewRef.current;
            if (view) view.dispatch(setLink(view.state, link.from, link.to, v === null ? null : normalizeLink(v)));
            endLink();
          }}
        />
      ) : null}
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
