import { useEffect, useState } from "react";
import { notifyStatus } from "../../ipc/notifyIpc";
import { soundTest } from "../../ipc/soundIpc";
import { windowOpen } from "../../ipc/windowsIpc";
import { useSettingsStore } from "../../state/settingsStore";
import { Button, Hint, PageTitle, Toggle } from "./controls";
import { RemindersGroup } from "./RemindersGroup";
import styles from "./general.module.css";

/** Settings, General: sounds, Today, reminders, tray list and the welcome replay. */
export function GeneralSection() {
  const s = useSettingsStore((x) => x.settings);
  const set = (p: Parameters<ReturnType<typeof useSettingsStore.getState>["update"]>[0]) => void useSettingsStore.getState().update(p).catch(() => {});
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!s.remindersEnabled) return setBlocked(false);
    void notifyStatus().then((v) => setBlocked(v !== "enabled")).catch(() => {});
  }, [s.remindersEnabled]);
  const welcome = () => {
    set({ onboardingCompleted: false });
    void windowOpen("onboarding").catch(() => {});
  };
  return (
    <div className={styles.page}>
      <PageTitle>General</PageTitle>
      <div className={styles.group}>
        <Toggle label="Sounds" checked={s.soundsEnabled} onChange={(soundsEnabled) => set({ soundsEnabled })}>
          <Button onClick={soundTest}>Test</Button>
        </Toggle>
        <Hint>A soft tick when you check something off.</Hint>
      </div>
      <div className={styles.group}>
        <Toggle label="Show Today pin" checked={s.showTodayPin} onChange={(showTodayPin) => set({ showTodayPin })} />
        <Hint>A sun pin at the top of the strip listing every task due today or overdue.</Hint>
      </div>
      <RemindersGroup blocked={blocked} />
      <div className={styles.group}>
        <Toggle label="Tray mini-list" checked={s.menuBarListEnabled} onChange={(menuBarListEnabled) => set({ menuBarListEnabled })} />
        <Hint>Left-click the tray icon for a quick list of open to-dos. Right-click for the menu.</Hint>
        <Toggle label="Show open count in the tray" checked={s.menuBarShowOpenCount} disabled={!s.menuBarListEnabled} onChange={(menuBarShowOpenCount) => set({ menuBarShowOpenCount })} />
      </div>
      <div className={styles.group}>
        <div><Button onClick={welcome}>Show welcome again</Button></div>
        <Hint>Replay the short setup: connect Notion and pin a page.</Hint>
      </div>
    </div>
  );
}
