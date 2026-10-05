import { useEffect, useRef, useState } from "react";
import { startOfDay } from "../../domain/capture/snooze";
import styles from "./database.module.css";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

interface Props {
  initial: Date | null;
  /** Anchor chip rect; the popover is fixed under it and flips above near the bottom. */
  anchor: DOMRect;
  onPick: (d: Date) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Month grid (Monday first) with a Clear button. A pick keeps the existing time of day (DatePickerPopover). */
export function DatePopover({ initial, anchor, onPick, onClear, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const base = initial ?? new Date();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const lead = (view.getDay() + 6) % 7;
  const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const today = startOfDay(new Date()).getTime();
  const sel = initial ? startOfDay(initial).getTime() : null;
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  const left = Math.max(4, Math.min(anchor.right - 224, window.innerWidth - 232));
  const below = anchor.bottom + 4;
  const top = below + 252 > window.innerHeight ? Math.max(4, anchor.top - 256) : below;
  return (
    <div ref={ref} className={styles.datePop} style={{ left, top }} role="dialog" aria-label="Pick a date">
      <div className={styles.calHead}>
        <button type="button" className={styles.calNav} aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <span>{monthNames[view.getMonth()]} {view.getFullYear()}</span>
        <button type="button" className={styles.calNav} aria-label="Next month" onClick={() => shift(1)}>›</button>
      </div>
      <div className={styles.calGrid}>
        {weekdays.map((w) => <span key={w} className={styles.calDow}>{w}</span>)}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const t = new Date(view.getFullYear(), view.getMonth(), day).getTime();
          const cls = [styles.calDay, t === sel ? styles.calSel : "", t === today ? styles.calToday : ""].join(" ");
          return (
            <button
              key={day}
              type="button"
              className={cls}
              onClick={() => {
                onPick(new Date(view.getFullYear(), view.getMonth(), day, initial?.getHours() ?? 0, initial?.getMinutes() ?? 0));
                onClose();
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
      <button type="button" className={styles.calClear} onClick={() => { onClear(); onClose(); }}>Clear</button>
    </div>
  );
}
