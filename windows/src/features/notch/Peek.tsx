import { useState } from "react";
import { motion } from "motion/react";
import type { PinSummary } from "../../domain/store/pinSummary";
import { contents, instant } from "../../theme/motion";
import { CheckIcon } from "./icons";
import type { NotchEdge, Rect } from "./notchGeometry";
import { peekItems, peekSubtitle } from "./peekModel";
import styles from "./peek.module.css";

interface Props {
  title: string;
  summary: PinSummary | null | undefined;
  rect: Rect;
  edge: NotchEdge;
  fontScale: number;
  reduce: boolean;
  onHover: (h: boolean) => void;
  onOpen: () => void;
  /** Ticking an item marks it done (the hub plays the tick and queues the write). */
  onCheck: (itemId: string) => void;
  /** Title click: open that item's page (database rows) or the pin. */
  onOpenItem?: (itemId: string, title: string) => void;
}

const ORIGIN = { right: "100% 50%", left: "0% 50%", top: "50% 0%" } as const;

/** Hover peek card: title, "N open" and up to three next items with real checkboxes. */
export function Peek({ title, summary, rect, edge, fontScale, reduce, onHover, onOpen, onCheck, onOpenItem }: Props) {
  const scale = reduce ? 1 : 0.92;
  // Ticked here but not yet gone from the refreshed summary.
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  return (
    <motion.div
      className={styles.card}
      data-testid="peek"
      style={{
        left: rect.x, top: rect.y, width: rect.width, height: rect.height,
        transformOrigin: ORIGIN[edge], fontSize: 12 * fontScale,
      }}
      initial={{ opacity: 0, scale }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale }}
      transition={reduce ? instant : contents}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onOpen}
    >
      <div className={styles.title}>{title}</div>
      <div className={styles.sub}>{peekSubtitle(summary)}</div>
      {peekItems(summary).map((t) => {
        const on = checked.has(t.id);
        return (
          <div key={t.id} className={styles.item}>
            <button
              type="button"
              className={styles.checkBtn}
              title={on ? "Done" : "Mark done"}
              aria-label={`${on ? "Done" : "Mark done"}: ${t.title}`}
              aria-pressed={on}
              onClick={(e) => {
                e.stopPropagation();
                if (on) return;
                setChecked((s) => new Set(s).add(t.id));
                onCheck(t.id);
              }}
            >
              <span className={`${styles.box} ${on ? styles.checked : ""}`}>{on && <CheckIcon width={8} height={8} />}</span>
            </button>
            <button
              type="button"
              className={`${styles.openBtn} ${on ? styles.done : styles.itemText}`}
              title="Open"
              aria-label={`Open ${t.title}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenItem) onOpenItem(t.id, t.title);
                else onOpen();
              }}
            >
              {t.title}
            </button>
          </div>
        );
      })}
    </motion.div>
  );
}
