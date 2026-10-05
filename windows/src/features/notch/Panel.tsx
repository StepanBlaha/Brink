import { useState } from "react";
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
}

/** Placeholder panel: header, fake task rows, a quick-add input (focus test). Real content: M3+. */
export function Panel({ pin, addFlow, keepOpen, fontScale, onToggleKeepOpen, onClose }: Props) {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const title = addFlow ? "Add a page" : (pin?.title ?? "");
  return (
    <div className={styles.panel} style={{ fontSize: 14 * fontScale }}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden>
          {addFlow ? <PlusIcon /> : pin?.icon}
        </span>
        <span className={styles.title}>{title}</span>
        <button
          type="button"
          className={`${styles.btn} ${keepOpen ? styles.on : ""}`}
          title={keepOpen ? "Unpin panel" : "Keep open"}
          onClick={onToggleKeepOpen}
        >
          <PinIcon />
        </button>
        <button type="button" className={styles.btn} title="Close" onClick={onClose}>
          <XIcon />
        </button>
      </header>
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
    </div>
  );
}
