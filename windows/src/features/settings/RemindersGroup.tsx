import { useSettingsStore } from "../../state/settingsStore";
import { Hint, Toggle } from "./controls";
import { formatMinutes, parseMinutes } from "./time";
import styles from "./general.module.css";

/** Due reminders, with the options that only matter once they are on. */
export function RemindersGroup({ blocked }: { blocked: boolean }) {
  const s = useSettingsStore((x) => x.settings);
  const set = (p: Parameters<ReturnType<typeof useSettingsStore.getState>["update"]>[0]) => void useSettingsStore.getState().update(p).catch(() => {});
  return (
    <div className={styles.group}>
      <Toggle label="Due reminders" checked={s.remindersEnabled} onChange={(remindersEnabled) => set({ remindersEnabled })} />
      <Hint>Notifies you when a task in a pinned database with a date is due.</Hint>
      {blocked && (
        <p className={styles.warn}>Notifications are turned off for Brink. Turn them on in Windows Settings, System, Notifications.</p>
      )}
      {s.remindersEnabled && (
        <>
          <label className={styles.row}>
            <span>Remind date-only tasks at</span>
            <select className={styles.select} value={s.reminderHour} onChange={(e) => set({ reminderHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{`${h}:00`}</option>
              ))}
            </select>
          </label>
          <Toggle label="Morning summary" checked={s.morningSummaryEnabled} onChange={(morningSummaryEnabled) => set({ morningSummaryEnabled })} />
          {s.morningSummaryEnabled && (
            <>
              <label className={styles.row}>
                <span>Summary time</span>
                <input
                  className={styles.select}
                  type="time"
                  value={formatMinutes(s.morningSummaryMinutes)}
                  onChange={(e) => {
                    const m = parseMinutes(e.target.value);
                    if (m !== null) set({ morningSummaryMinutes: m });
                  }}
                />
              </label>
              <Hint>For example "5 tasks due today".</Hint>
            </>
          )}
          <Toggle label="Peek the notch for reminders" checked={s.peekForReminders} onChange={(peekForReminders) => set({ peekForReminders })} />
          <Hint>Unfolds the notch for 3 seconds on the pin when a reminder fires while Brink is running.</Hint>
        </>
      )}
    </div>
  );
}
