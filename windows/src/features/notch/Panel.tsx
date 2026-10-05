import { useState, type ReactNode } from "react";
import type { FakePin } from "./fakePins";
import { CheckIcon, PinIcon, PlusIcon, XIcon } from "./icons";
import styles from "./panel.module.css";

interface Props {
  pin: FakePin | null;
  addFlow: boolean;
  keepOpen: boolean;
  fontScale: number;
  onToggleKeepOpen: () => void;
  onClose: () => void;
  /** Real content (database view); replaces the placeholder rows and quick-add. */
  children?: ReactNode;
}

/** Placeholder panel: header, fake task rows, a quick-add input (focus test). Real content: M3+. */
export function Panel({ pin, addFlow, keepOpen, fontScale, onToggleKeepOpen, onClose, children }: Props) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const title = addFlow ? "Add a page" : (pin?.title ?? "");
  return (
    <section className={styles.panel} aria-label={title || "Panel"} style={{ fontSize: `calc(${14 * fontScale}px * var(--text-scale, 1))` }}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden>
          {addFlow ? <PlusIcon /> : pin?.icon}
        </span>
        <h2 className={styles.title}>{title}</h2>
        <button
          type="button"
          className={`${styles.btn} ${keepOpen ? styles.on : ""}`}
          title={keepOpen ? "Unpin panel" : "Keep open"}
          aria-label="Keep open"
          aria-pressed={keepOpen}
          onClick={onToggleKeepOpen}
        >
          <PinIcon />
        </button>
        <button type="button" className={styles.btn} title="Close" aria-label="Close panel" onClick={onClose}>
          <XIcon />
        </button>
      </header>
      {children ? (
        <div className={styles.body}>{children}</div>
      ) : (
      <>
      <div className={styles.body}>
        {addFlow ? (
          <p className={styles.empty}>Search your workspace to pin a page.</p>
        ) : (
          (pin?.next ?? []).map((t) => {
            const checked = done[t.id] ?? t.done;
            return (
              <label key={t.id} className={styles.row}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setDone((d) => ({ ...d, [t.id]: !checked }))}
                  className={styles.check}
                />
                <span className={styles.box} aria-hidden>
                  {checked && <CheckIcon width={10} height={10} />}
                </span>
                <span className={checked ? styles.done : undefined}>{t.title}</span>
              </label>
            );
          })
        )}
      </div>
      <input className={styles.quick} placeholder="Add a task" aria-label="Quick add" />
      </>
      )}
    </section>
  );
}
