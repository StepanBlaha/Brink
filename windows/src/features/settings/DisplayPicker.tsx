import { useEffect, useState } from "react";
import { storedDisplayPreference, type ScreenInfo } from "../../domain/store/displayPreference";
import { screenLabels } from "./screenLabels";
import { listScreens } from "../notch/useSettingsSync";
import styles from "./appearance.module.css";

interface Props {
  value: string;
  onChange: (stored: string) => void;
  /** Browser dev and tests pass screens directly. */
  screens?: ScreenInfo[];
}

/** Main display, display with the mouse, or one named display. Re-reads the list when it changes. */
export function DisplayPicker({ value, onChange, screens: fixed }: Props) {
  const [screens, setScreens] = useState<ScreenInfo[]>(fixed ?? []);
  useEffect(() => {
    if (fixed) return;
    let alive = true;
    const read = () => void listScreens().then((s) => alive && setScreens(s)).catch(() => {});
    read();
    const t = setInterval(read, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [fixed]);
  const labels = screenLabels(screens);
  const stored = screens.map((s) => storedDisplayPreference({ kind: "named", name: s.name, frame: s.frame }));
  const known = value === "main" || value === "mouse" || stored.includes(value);
  return (
    <select aria-label="Display" className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="main">Main display</option>
      <option value="mouse">Display with mouse</option>
      {screens.map((_, i) => (
        <option key={stored[i]} value={stored[i]}>{labels[i]}</option>
      ))}
      {!known && <option value={value}>Display not connected</option>}
    </select>
  );
}
