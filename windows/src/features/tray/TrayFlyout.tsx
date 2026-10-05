import { useEffect, useMemo, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { emit } from "@tauri-apps/api/event";
import { trayFlyoutHide } from "../../ipc/captureIpc";
import { showSettings } from "../../ipc/commands";
import { contents } from "../../theme/motion";
import { ChevronLeftIcon } from "../common/icons";
import type { Pin } from "../../domain/store/pin";
import { MiniListModel, type MiniPorts } from "./miniListModel";
import styles from "./tray.module.css";

const pinGlyph = (p: Pin): string =>
  "emoji" in p.icon ? p.icon.emoji._0 : (p.title.trim()[0] ?? "•").toUpperCase();

/** The tray flyout (MiniListView): add field, collapsible pin sections, check-off rows, footer. */
export function TrayFlyout({ ports, onOpenInNotch }: { ports: MiniPorts; onOpenInNotch?: (id: string) => void }) {
  const model = useMemo(() => new MiniListModel(ports), [ports]);
  useSyncExternalStore(model.subscribe, model.getVersion);
  const sections = model.sections;
  const target = model.targetPin;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void trayFlyoutHide().catch(() => {});
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openInNotch = () => {
    if (!target) return;
    if (onOpenInNotch) onOpenInNotch(target.id);
    else void emit("notch://open-pin", { pinId: target.id });
    void trayFlyoutHide().catch(() => {});
  };
  const empty = sections.length === 0;

  return (
    <motion.div className={styles.flyout} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={contents}>
      <div className={styles.field}>
        <span className={styles.plus}>+</span>
        <input
          className={styles.input}
          autoFocus
          spellCheck={false}
          placeholder={target ? `Add to ${target.title}…` : "Add a to-do…"}
          value={model.query}
          onChange={(e) => model.setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void model.quickAdd()}
        />
      </div>
      <div className={styles.list}>
        {empty && <p className={styles.empty}>{model.hasToken ? "No pins yet." : "Connect Notion in Settings."}</p>}
        {sections.map((s) => {
          const pin = model.pinById(s.pinID);
          const open = model.expanded.has(s.pinID);
          const rows = model.visibleItems(s.pinID);
          const count = model.openCount(s);
          return (
            <div key={s.pinID}>
              <button
                type="button"
                className={`${styles.section} ${target?.id === s.pinID ? styles.target : ""}`}
                aria-expanded={open}
                onClick={() => model.toggleExpanded(s.pinID)}
              >
                <ChevronLeftIcon width={11} height={11} className={styles.chevron} style={{ transform: `rotate(${open ? -90 : 180}deg)` }} />
                <span className={styles.glyph}>{pin ? pinGlyph(pin) : ""}</span>
                <span className={styles.title}>{s.title}</span>
                {count > 0 && <span className={styles.count}>{count}</span>}
              </button>
              {open && pin && (
                <>
                  {rows.length === 0 && <p className={styles.note}>{model.isLoading(s.pinID) ? "Loading…" : "Nothing open"}</p>}
                  <AnimatePresence initial={false}>
                    {rows.map((item) => (
                      <motion.div key={item.id} className={styles.item} layout exit={{ opacity: 0, x: -12 }} transition={contents}>
                        <button type="button" className={styles.check} aria-label={`Complete ${item.title}`} onClick={() => void model.check(item, pin)} />
                        <span className={styles.itemTitle}>{item.title}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.footer}>
        <button type="button" disabled={!target} onClick={openInNotch}>Open in notch</button>
        {model.message && <span className={styles.error}>{model.message}</span>}
        <button type="button" onClick={() => void showSettings().catch(() => {})}>Settings…</button>
      </div>
    </motion.div>
  );
}
