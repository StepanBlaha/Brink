import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { SnoozeOption } from "../../domain/capture/snooze";
import type { TodayItem } from "../../domain/store/todayAggregator";
import { instant, list } from "../../theme/motion";
import { CheckIcon } from "../notch/icons";
import { ContextMenu } from "../database/ContextMenu";
import styles from "./today.module.css";
import { REFRESH_EVERY_MS, todayDateLabel, type TodayModel } from "./todayModel";
import { useClock, useDigest } from "./useToday";

interface Props {
  model: TodayModel;
  hasDatabasePins: boolean;
  reduce: boolean;
  /** Called on open and every 30 s while the panel is visible. */
  refresh: () => void;
}

/** The Today panel: every open item due today or overdue across the database pins, by pin. */
export function TodayView({ model, hasDatabasePins, reduce, refresh }: Props) {
  useSyncExternalStore(model.subscribe, model.getVersion);
  const now = useClock(REFRESH_EVERY_MS);
  const digest = useDigest(now);
  const [menu, setMenu] = useState<{ item: TodayItem; x: number; y: number } | null>(null);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_EVERY_MS);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => model.prune(), [model, digest]);
  const sections = model.visibleSections();
  const snooze = (item: TodayItem, o: SnoozeOption) => () => model.snooze(item, o);
  return (
    <div className={styles.view}>
      <div className={styles.header}>Today {"·"} {model.openCount()} open</div>
      {sections.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No tasks due today</div>
          {!hasDatabasePins && <div className={styles.emptyHint}>Pin a database with a date property and its tasks show up here.</div>}
        </div>
      ) : (
        <div className={styles.scroll}>
          {sections.map((s) => (
            <section key={s.pinId} className={styles.section}>
              <h3 className={styles.sectionTitle}>{s.pinTitle}</h3>
              <AnimatePresence initial={false}>
                {s.items.map((item) => {
                  const checked = model.isChecked(item.id);
                  return (
                    <motion.div
                      key={item.id}
                      className={styles.row}
                      layout={!reduce}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 30 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={reduce ? instant : list}
                    >
                      <button
                        type="button"
                        className={`${styles.check} ${checked ? styles.checked : ""} ${item.isOverdue && !checked ? styles.overdueBox : ""}`}
                        aria-label={`Mark ${item.title} done`}
                        aria-pressed={checked}
                        onClick={() => model.toggleDone(item)}
                      >
                        {checked && <CheckIcon width={10} height={10} />}
                      </button>
                      <span className={`${styles.title} ${checked ? styles.struck : ""}`}>{item.title}</span>
                      <span className={`${styles.date} ${item.isOverdue ? styles.overdue : ""}`}>
                        {todayDateLabel(item.due, item.hasTime, now)}
                      </span>
                      <button
                        type="button"
                        className={styles.snooze}
                        title="Snooze"
                        aria-label={`Snooze ${item.title}`}
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenu({ item, x: r.left, y: r.bottom + 4 });
                        }}
                      >
                        <MoonIcon />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </section>
          ))}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title="Snooze"
          onClose={() => setMenu(null)}
          items={[
            { label: "Later today (+3h)", disabled: !menu.item.hasTime, onSelect: snooze(menu.item, "laterToday") },
            { label: "Tomorrow", onSelect: snooze(menu.item, "tomorrow") },
            { label: "Next week (Monday)", onSelect: snooze(menu.item, "nextWeek") },
          ]}
        />
      )}
    </div>
  );
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
