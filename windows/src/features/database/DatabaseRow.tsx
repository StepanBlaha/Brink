import { motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import type { Row } from "../../domain/notion/row";
import { list as listSpring, instant } from "../../theme/motion";
import { CheckIcon } from "../notch/icons";
import { openInNotion } from "../../ipc/commands";
import { chipText, isOverdue } from "./dates";
import type { DatabaseModel } from "./databaseModel";
import { DatePopover } from "./DatePopover";
import { useOpenRowPage } from "./rowPageContext";
import { RowContextMenu } from "./RowContextMenu";
import { RowChevron, RowTitle } from "./RowTitle";
import styles from "./database.module.css";

interface Props {
  model: DatabaseModel;
  row: Row;
  animatingOut: boolean;
}

export function DatabaseRow({ model, row, animatingOut }: Props) {
  const reduce = useReducedMotion() ?? false;
  const transition = reduce ? instant : listSpring;
  const [datePicker, setDatePicker] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openRowPage = useOpenRowPage();
  const openPage = (from?: HTMLElement | null) => openRowPage?.(row.id, row.title, from ?? titleRef.current);

  const done = model.isDone(row);
  const status = model.statusName(row);
  const hasDateProp = model.config?.dateProperty !== undefined;
  const date = model.date(row);
  const hasTime = model.dateHasTime(row);

  return (
    <motion.div
      layout="position"
      className={styles.row}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: animatingOut ? 0 : 1, x: animatingOut ? 8 : 0, y: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={transition}
      onContextMenu={(e) => {
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
      <RowTitle
        ref={titleRef}
        title={row.title}
        done={done}
        renaming={renaming}
        onOpen={openPage}
        onCommit={(t) => {
          setRenaming(false);
          void model.rename(row.id, t);
        }}
        onCancel={() => setRenaming(false)}
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
      <RowChevron onOpen={() => openPage()} />
      {menu && (
        <RowContextMenu
          {...menu}
          onClose={() => setMenu(null)}
          onOpenPage={() => openPage()}
          onOpenInNotion={() => void openInNotion(row.id).catch(() => {})}
          {...(model.isReadOnly ? {} : { onRename: () => setRenaming(true) })}
          {...(hasDateProp ? { snooze: { hasTime, onSnooze: (o) => void model.snooze(row.id, o), onPickDate: () => setDatePicker(true) } } : {})}
        />
      )}
    </motion.div>
  );
}
