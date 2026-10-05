import { forwardRef, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import styles from "./database.module.css";
import pageStyles from "./rowPage.module.css";

interface Props {
  title: string;
  done: boolean;
  renaming: boolean;
  onOpen: (el: HTMLElement) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/** Row title: a button that opens the page, or (via Rename) an input; plus the hover chevron. */
export const RowTitle = forwardRef<HTMLButtonElement, Props>(function RowTitle({ title, done, renaming, onOpen, onCommit, onCancel }, ref) {
  const [text, setText] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  useEffect(() => setText(title), [title]);
  useEffect(() => {
    if (!renaming) return;
    settled.current = false;
    input.current?.focus();
    input.current?.select();
  }, [renaming]);
  const label = title.trim() === "" ? "Untitled" : title;
  const finish = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (save) onCommit(text);
    else {
      setText(title);
      onCancel();
    }
  };
  if (renaming) {
    return (
      <input
        ref={input}
        className={styles.title}
        value={text}
        aria-label="Task title"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") {
            e.stopPropagation();
            finish(false);
          }
        }}
      />
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.titleBtn} ${done ? styles.doneText : ""}`}
      aria-label={`Open page ${label}`}
      onClick={(e) => onOpen(e.currentTarget)}
    >
      {label}
    </button>
  );
});

/** Hover chevron at the row's end. Mouse shortcut only; the title button is the keyboard path. */
export function RowChevron({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={pageStyles.chevron} aria-label="Open page" title="Open page" tabIndex={-1} aria-hidden onClick={onOpen}>
      <ChevronRight size={12} aria-hidden />
    </button>
  );
}
