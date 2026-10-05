import { useEffect, useRef } from "react";
import type { EditorView } from "prosemirror-view";
import { countLabel, findAction, findKey, type FindState } from "./plugins/find";
import styles from "./editor.module.css";

/** Ctrl+F bar: query, "i of n", Enter next, Shift+Enter previous, Esc or the close button (FindBar.swift). */
export function FindBar({ view, find }: { view: EditorView; find: FindState }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, [find.focus]);
  const run = (m: Parameters<typeof findAction>[1]) => view.dispatch(findAction(view.state.tr, m));
  const close = () => { run({ close: true }); view.focus(); };
  return (
    <div className={styles.find} role="search">
      <input
        ref={input} className={styles.findInput} aria-label="Find in page" placeholder="Find" value={find.query}
        onChange={(e) => run({ query: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); run({ step: e.shiftKey ? -1 : 1 }); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
        }}
      />
      <span className={styles.findCount}>{countLabel(find)}</span>
      <button type="button" className={styles.findBtn} aria-label="Previous match" onClick={() => run({ step: -1 })}>↑</button>
      <button type="button" className={styles.findBtn} aria-label="Next match" onClick={() => run({ step: 1 })}>↓</button>
      <button type="button" className={styles.findBtn} aria-label="Close find" onClick={close}>✕</button>
    </div>
  );
}

export const getFind = (view: EditorView): FindState | undefined => findKey.getState(view.state);
