import { useEffect, useRef, useState } from "react";
import styles from "./editor.module.css";

interface Props {
  initial: string;
  /** Position inside the editor wrapper. */
  x: number;
  y: number;
  /** `null` removes the link. */
  onSubmit: (url: string | null) => void;
  onCancel: () => void;
}

/** One-line URL field for Ctrl+K: Enter applies, empty removes, Esc cancels (LinkField on the Mac). */
export function LinkPopover({ initial, x, y, onSubmit, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  return (
    <div className={styles.linkPop} style={{ left: x, top: y }} role="dialog" aria-label="Link">
      <span className={styles.linkIcon} aria-hidden="true">🔗</span>
      <input
        ref={input} className={styles.linkInput} placeholder="Paste link" aria-label="Link URL" value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onSubmit(text.trim() === "" ? null : text); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
        }}
      />
    </div>
  );
}
