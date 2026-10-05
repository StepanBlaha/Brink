import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { emojiPanelOpen } from "../../ipc/windowsIpc";
import { filterEmoji } from "./emojiCatalog";
import { insertedEmoji } from "./iconPickerModel";
import styles from "./iconPicker.module.css";

interface Props {
  isPage: boolean;
  alsoNotion: boolean;
  onAlsoNotion: (v: boolean) => void;
  onPick: (emoji: string) => void;
}

/** Search, 8 columns, "Also set as page icon in Notion" for pages, and the Windows emoji panel. */
export function EmojiTab({ isPage, alsoNotion, onAlsoNotion, onPick }: Props) {
  const [query, setQuery] = useState("");
  const capture = useRef<HTMLInputElement>(null);
  const groups = filterEmoji(query);
  const openPanel = () => {
    capture.current?.focus();
    void emojiPanelOpen().catch(() => {});
  };
  return (
    <div className={styles.tabBody}>
      <label className={styles.searchBox}>
        <Search size={13} aria-hidden />
        <input className={styles.searchInput} aria-label="Search emoji" placeholder="Search emoji..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {isPage && (
        <label className={styles.check}>
          <input type="checkbox" checked={alsoNotion} onChange={(e) => onAlsoNotion(e.target.checked)} />
          Also set as page icon in Notion
        </label>
      )}
      <div className={styles.scroll}>
        {groups.length === 0 && <p className={styles.none}>No emoji found.</p>}
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className={styles.groupTitle}>{g.title}</h3>
            <div className={styles.emojis}>
              {g.entries.map((en) => (
                <button key={en.emoji} type="button" className={styles.cell} aria-label={en.keywords[0] ?? en.emoji} onClick={() => onPick(en.emoji)}>
                  {en.emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <button type="button" className={styles.panelBtn} onClick={openPanel}>Open emoji panel</button>
      <input
        ref={capture}
        className={styles.capture}
        aria-hidden
        tabIndex={-1}
        autoComplete="off"
        onChange={(e) => {
          const em = insertedEmoji(e.target.value);
          e.target.value = "";
          if (em) onPick(em);
        }}
      />
    </div>
  );
}
