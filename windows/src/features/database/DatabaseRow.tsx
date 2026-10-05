import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Row } from "../../domain/notion/row";
import { list as listSpring, instant } from "../../theme/motion";
import { CheckIcon } from "../notch/icons";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { chipText, isOverdue } from "./dates";
import type { DatabaseModel } from "./databaseModel";
import { DatePopover } from "./DatePopover";
import styles from "./database.module.css";

interface Props {
  model: DatabaseModel;
  row: Row;
  animatingOut: boolean;
}

export function DatabaseRow({ model, row, animatingOut }: Props) {
  const reduce = useReducedMotion() ?? false;
  const transition = reduce ? instant : listSpring;
  const [text, setText] = useState(row.title);
  const [datePicker, setDatePicker] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => setText(row.title), [row.title]);

  const done = model.isDone(row);
  const status = model.statusName(row);
  const hasDateProp = model.config?.dateProperty !== undefined;
  const date = model.date(row);
  const hasTime = model.dateHasTime(row);

  const commit = () => void model.rename(row.id, text);
  const menuItems: (MenuItem | "divider")[] = [
    { label: "Later today (+3h)", disabled: !hasTime, onSelect: () => void model.snooze(row.id, "laterToday") },
    { label: "Tomorrow", onSelect: () => void model.snooze(row.id, "tomorrow") },
    { label: "Next week (Monday)", onSelect: () => void model.snooze(row.id, "nextWeek") },
    "divider",
    { label: "Pick date…", onSelect: () => setDatePicker(true) },
  ];

  return (
    <motion.div
      layout="position"
      className={styles.row}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: animatingOut ? 0 : 1, x: animatingOut ? 8 : 0, y: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={transition}
      onContextMenu={(e) => {
        if (!hasDateProp) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      data-testid="db-row"
    >
      {!model.isReadOnly && (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? "Mark not done" : "Mark done"}
          className={`${styles.check} ${done ? styles.checked : ""}`}
          onClick={() => void model.toggleDone(row.id)}
        >
          {done && <CheckIcon width={10} height={10} />}
        </button>
      )}
      <input
        className={`${styles.title} ${done ? styles.doneText : ""}`}
        value={text}
        aria-label="Task title"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setText(row.title);
        }}
      />
      {status && <span className={styles.pill}>{status}</span>}
      {hasDateProp && (
        <span className={styles.dateWrap}>
          <button
            ref={chipRef}
            type="button"
            className={`${styles.chip} ${isOverdue(date) ? styles.overdue : ""}`}
            onClick={() => setDatePicker((v) => !v)}
          >
            {chipText(date, hasTime)}
          </button>
          {datePicker && chipRef.current && (
            <DatePopover
              initial={date}
              anchor={chipRef.current.getBoundingClientRect()}
              onPick={(d) => void model.setDate(row.id, d, hasTime)}
              onClear={() => void model.setDate(row.id, null)}
              onClose={() => setDatePicker(false)}
            />
          )}
        </span>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} title="Snooze" items={menuItems} onClose={() => setMenu(null)} />}
    </motion.div>
  );
}
