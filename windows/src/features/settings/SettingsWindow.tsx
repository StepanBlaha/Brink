import { useEffect, useState } from "react";
import { Folder, Keyboard, Link, Palette, Settings as Gear, type LucideIcon } from "lucide-react";
import { on } from "../../ipc/events";
import { settingsSectionEvent, type SettingsSection } from "../../ipc/windowsIpc";
import { initState } from "../../state/bridge";
import { AppearanceSection } from "./AppearanceSection";
import { ConnectionSection } from "./ConnectionSection";
import { GeneralSection } from "./GeneralSection";
import { GroupsSection } from "./GroupsSection";
import { ShortcutsSection } from "./ShortcutsSection";
import styles from "./window.module.css";

export const SECTIONS: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
  { id: "connection", label: "Connection", icon: Link },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "general", label: "General", icon: Gear },
  { id: "groups", label: "Groups", icon: Folder },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
];

export const isSection = (v: string | undefined): v is SettingsSection => SECTIONS.some((s) => s.id === v);

function Body({ id }: { id: SettingsSection }) {
  switch (id) {
    case "connection": return <ConnectionSection />;
    case "appearance": return <AppearanceSection />;
    case "general": return <GeneralSection />;
    case "groups": return <GroupsSection />;
    case "shortcuts": return <ShortcutsSection />;
  }
}

/** The 560x540 settings window: a sidebar of five sections and the section body. */
export function SettingsWindow({ initial }: { initial?: string | undefined }) {
  const [section, setSection] = useState<SettingsSection>(isSection(initial) ? initial : "connection");
  useEffect(() => {
    const stop = initState();
    const sub = on<string>(settingsSectionEvent, (s) => isSection(s) && setSection(s));
    return () => {
      void stop.then((f) => f());
      void sub.then((f) => f());
    };
  }, []);
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (d === 0) return;
    e.preventDefault();
    const next = SECTIONS[(i + d + SECTIONS.length) % SECTIONS.length];
    if (next) {
      setSection(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  };
  return (
    <div className={styles.window}>
      <nav className={styles.sidebar} aria-label="Settings sections" role="tablist" aria-orientation="vertical">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            id={`tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={s.id === section}
            aria-controls="settings-body"
            tabIndex={s.id === section ? 0 : -1}
            className={`${styles.tab} ${s.id === section ? styles.tabOn : ""}`}
            onClick={() => setSection(s.id)}
            onKeyDown={(e) => move(e, i)}
          >
            <s.icon size={15} aria-hidden />
            {s.label}
          </button>
        ))}
      </nav>
      <main id="settings-body" role="tabpanel" aria-labelledby={`tab-${section}`} className={styles.body}>
        <Body id={section} />
      </main>
    </div>
  );
}
