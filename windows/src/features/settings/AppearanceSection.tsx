import { useEffect, useState } from "react";
import { systemAccent } from "../../ipc/windowsIpc";
import type { BadgeMode, DockEdge, DockSize, PillProgressMode, PillStyleSetting } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { AccentGrid } from "./AccentGrid";
import { Field, Hint, PageTitle, Segmented, Toggle } from "./controls";
import { DisplayPicker } from "./DisplayPicker";
import { StartupRow } from "./StartupRow";
import styles from "./appearance.module.css";

const SIZES: { value: DockSize; label: string }[] = [
  { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" },
];
const EDGES: { value: DockEdge; label: string }[] = [
  { value: "left", label: "Left" }, { value: "top", label: "Top" }, { value: "right", label: "Right" },
];
const BADGES: { value: BadgeMode; label: string }[] = [
  { value: "off", label: "Off" }, { value: "open", label: "Open items" }, { value: "dueToday", label: "Due today" },
];
const PILLS: { value: PillStyleSetting; label: string }[] = [
  { value: "hidden", label: "Hidden" }, { value: "dot", label: "Dot" }, { value: "line", label: "Line" }, { value: "percent", label: "Percent" },
];
const PROGRESS: { value: PillProgressMode; label: string }[] = [
  { value: "off", label: "Off" }, { value: "activeGroup", label: "Active group" }, { value: "lastPin", label: "Last pin" },
];

/** Settings, Appearance: everything applies live through `settings://changed`. */
export function AppearanceSection() {
  const s = useSettingsStore((x) => x.settings);
  const set = (p: Parameters<ReturnType<typeof useSettingsStore.getState>["update"]>[0]) => void useSettingsStore.getState().update(p).catch(() => {});
  const [system, setSystem] = useState<number | null>(null);
  useEffect(() => {
    void systemAccent().then(setSystem).catch(() => {});
  }, []);
  return (
    <div className={styles.page}>
      <PageTitle>Appearance</PageTitle>
      <Field title="Accent color">
        <AccentGrid value={s.accentPreset} system={system} onChange={(accentPreset) => set({ accentPreset })} />
      </Field>
      <Field title="Size">
        <Segmented label="Size" value={s.dockSize} options={SIZES} onChange={(dockSize) => set({ dockSize })} />
      </Field>
      <Field title="Dock edge">
        <Segmented label="Dock edge" value={s.dockEdge} options={EDGES} onChange={(dockEdge) => set({ dockEdge })} maxWidth={240} />
        {s.dockEdge === "top" && <Hint>The top position sits centered on your screen.</Hint>}
      </Field>
      <Field title="Outline">
        <Toggle label="Light edge around the notch" checked={s.notchOutline} onChange={(notchOutline) => set({ notchOutline })} />
        <Hint>Keeps the notch visible on black wallpapers and dark apps.</Hint>
      </Field>
      <Field title="Display">
        <DisplayPicker value={s.displayPreference} onChange={(displayPreference) => set({ displayPreference })} />
      </Field>
      <Field title="Badge">
        <Segmented label="Badge" value={s.badgeMode} options={BADGES} onChange={(badgeMode) => set({ badgeMode })} />
      </Field>
      <Field title="Resting pill">
        <Segmented label="Resting pill" value={s.pillStyle} options={PILLS} onChange={(pillStyle) => set({ pillStyle })} />
        {s.pillStyle === "percent" && (
          <Segmented
            label="Percent format"
            value={s.pillShowsFraction ? "fraction" : "percent"}
            options={[{ value: "fraction", label: "7/12" }, { value: "percent", label: "58%" }]}
            onChange={(v) => set({ pillShowsFraction: v === "fraction" })}
            maxWidth={160}
          />
        )}
        <Hint>The edge hot zone still reveals the strip even with the pill hidden.</Hint>
      </Field>
      <Field title="Pill progress (Line and Percent)">
        <Segmented label="Pill progress" value={s.pillProgressMode} options={PROGRESS} onChange={(pillProgressMode) => set({ pillProgressMode })} />
      </Field>
      <Field title="Startup">
        <StartupRow />
      </Field>
    </div>
  );
}
