import { useState } from "react";
import { X } from "lucide-react";
import { notionSetPageEmojiIcon } from "../../ipc/commands";
import { usePinsStore } from "../../state/pinsStore";
import { errorMessage } from "../pinning/usePinSearch";
import { EmojiTab } from "./EmojiTab";
import { DEFAULT_SWATCH, emojiIcon, letterIcon, symbolIcon, withCustomIcon } from "./iconPickerModel";
import { LetterTab } from "./LetterTab";
import { SymbolTab } from "./SymbolTab";
import styles from "./iconPicker.module.css";

type Tab = "emoji" | "symbol" | "letter";
const TABS: { id: Tab; label: string }[] = [
  { id: "emoji", label: "Emoji" }, { id: "symbol", label: "Symbol" }, { id: "letter", label: "Letter" },
];

/** "Change Icon…": picking applies at once, "Reset to Notion icon" clears the override. Lives inside the expanded notch. */
export function IconPicker({ pinId, onClose }: { pinId: string; onClose: () => void }) {
  const pin = usePinsStore((s) => s.pins.find((p) => p.id === pinId));
  const [tab, setTab] = useState<Tab>("emoji");
  const [color, setColor] = useState(DEFAULT_SWATCH);
  const [alsoNotion, setAlsoNotion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pin) return null;
  const save = (icon: Parameters<typeof withCustomIcon>[1]) => void usePinsStore.getState().update(withCustomIcon(pin, icon)).catch(() => {});
  const pickEmoji = (emoji: string) => {
    save(emojiIcon(emoji));
    if (alsoNotion && pin.kind === "page") {
      setError(null);
      notionSetPageEmojiIcon(pin.notionId, emoji).catch((e) =>
        setError(errorMessage(e, "Could not update the Notion page icon. Share the page with your integration in Notion.")));
    }
  };
  return (
    <div className={styles.picker} role="dialog" aria-label="Change Icon">
      <header className={styles.header}>
        <h2 className={styles.title}>Change Icon</h2>
        <button type="button" className={styles.close} aria-label="Close" onClick={onClose}><X size={14} /></button>
      </header>
      <div role="tablist" aria-label="Icon type" className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {tab === "emoji" && <EmojiTab isPage={pin.kind === "page"} alsoNotion={alsoNotion} onAlsoNotion={setAlsoNotion} onPick={pickEmoji} />}
        {tab === "symbol" && <SymbolTab color={color} onColor={setColor} onPick={(name) => save(symbolIcon(name, color))} />}
        {tab === "letter" && <LetterTab pin={pin} color={color} onColor={setColor} onUse={(text) => save(letterIcon(text, color))} />}
      </div>
      <footer className={styles.footer}>
        {error !== null && <p role="alert" className={styles.error}>{error}</p>}
        <button type="button" className={styles.reset} disabled={pin.customIcon === undefined} onClick={() => save(undefined)}>Reset to Notion icon</button>
      </footer>
    </div>
  );
}
