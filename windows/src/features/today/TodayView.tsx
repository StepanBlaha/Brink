import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence } from "motion/react";
import type { SnoozeOption } from "../../domain/capture/snooze";
import type { TodayItem } from "../../domain/store/todayAggregator";
import { ContextMenu } from "../database/ContextMenu";
import { RowPageHost } from "../database/RowPageHost";
import { TODAY_PIN_ID } from "../strip/pinItems";
import { TodayRow } from "./TodayRow";
import styles from "./today.module.css";
import { REFRESH_EVERY_MS, type TodayModel } from "./todayModel";
import { useClock, useDigest } from "./useToday";
import { visibleInterval } from "../../services/visibleInterval";

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
    return visibleInterval(refresh, REFRESH_EVERY_MS);
  }, [refresh]);
  useEffect(() => model.prune(), [model, digest]);
  const sections = model.visibleSections();
  const snooze = (item: TodayItem, o: SnoozeOption) => () => model.snooze(item, o);
  return (
    <RowPageHost pinId={TODAY_PIN_ID}>
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
                    <TodayRow
                      key={item.id}
                      item={item}
                      checked={checked}
                      now={now}
                      reduce={reduce}
                      onToggle={() => model.toggleDone(item)}
                      onSnoozeButton={(x, y) => setMenu({ item, x, y })}
                    />
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
    </RowPageHost>
  );
}
