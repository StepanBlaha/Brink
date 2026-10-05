import { useRef, useState } from "react";
import { motion } from "motion/react";
import type { TodayItem } from "../../domain/store/todayAggregator";
import { openInNotion } from "../../ipc/commands";
import { instant, list } from "../../theme/motion";
import { useOpenRowPage } from "../database/rowPageContext";
import { RowContextMenu } from "../database/RowContextMenu";
import { RowChevron } from "../database/RowTitle";
import { CheckIcon } from "../notch/icons";
import styles from "./today.module.css";
import { todayDateLabel } from "./todayModel";

interface Props {
  item: TodayItem;
  checked: boolean;
  now: Date;
  reduce: boolean;
  onToggle: () => void;
  onSnoozeButton: (x: number, y: number) => void;
}

/** One Today row: check, title (opens the row's page), date, snooze, hover chevron, context menu. */
export function TodayRow({ item, checked, now, reduce, onToggle, onSnoozeButton }: Props) {
  const openRowPage = useOpenRowPage();
  const titleRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openPage = () => openRowPage?.(item.id, item.title, titleRef.current);
  const label = item.title.trim() === "" ? "Untitled" : item.title;
  return (
    <motion.div
      className={styles.row}
      layout={!reduce}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 30 }}
      exit={{ opacity: 0, height: 0 }}
      transition={reduce ? instant : list}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <button
        type="button"
        className={`${styles.check} ${checked ? styles.checked : ""} ${item.isOverdue && !checked ? styles.overdueBox : ""}`}
        aria-label={`Mark ${item.title} done`}
        aria-pressed={checked}
        onClick={onToggle}
      >
        {checked && <CheckIcon width={10} height={10} />}
      </button>
      <button
        ref={titleRef}
        type="button"
        className={`${styles.title} ${styles.titleBtn} ${checked ? styles.struck : ""}`}
        aria-label={`Open page ${label}`}
        onClick={openPage}
      >
        {label}
      </button>
      <span className={`${styles.date} ${item.isOverdue ? styles.overdue : ""}`}>{todayDateLabel(item.due, item.hasTime, now)}</span>
      <button
        type="button"
        className={styles.snooze}
        title="Snooze"
        aria-label={`Snooze ${item.title}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSnoozeButton(r.left, r.bottom + 4);
        }}
      >
        <MoonIcon />
      </button>
      <RowChevron onOpen={openPage} />
      {menu && (
        <RowContextMenu
          {...menu}
          onClose={() => setMenu(null)}
          onOpenPage={openPage}
          onOpenInNotion={() => void openInNotion(item.id).catch(() => {})}
        />
      )}
    </motion.div>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
