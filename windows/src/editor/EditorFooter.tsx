import { useSyncExternalStore } from "react";
import { statusLabel, type PageEditorEngine } from "../domain/editor/engine";
import styles from "./editor.module.css";

export interface FooterModel {
  text: string;
  tone: "normal" | "dim" | "danger";
  /** Count for the "Delete N blocks in Notion" button when the mass-delete guard is waiting. */
  massDelete: number | null;
}

/** What the footer shows (PageView.footer): restored hint, else error message, else the save status. */
export function footerModel(e: Pick<PageEditorEngine, "restoredTokenHint" | "errorMessage" | "isDocumentEmpty" | "hasLoaded" | "status" | "pendingMassDelete">): FooterModel {
  const massDelete = e.pendingMassDelete;
  if (e.restoredTokenHint) return { text: e.restoredTokenHint, tone: "danger", massDelete };
  if (e.errorMessage && (!e.isDocumentEmpty || e.hasLoaded)) return { text: e.errorMessage, tone: "danger", massDelete };
  const tone = e.status.t === "error" ? "danger" : e.status.t === "offline" ? "dim" : "normal";
  return { text: statusLabel(e.status), tone, massDelete };
}

const snapshotKey = (e: PageEditorEngine): string => JSON.stringify(footerModel(e));

/** Status line plus the mass-delete confirmation button. */
export function EditorFooter({ engine }: { engine: PageEditorEngine }) {
  const key = useSyncExternalStore((fn) => engine.subscribe(fn), () => snapshotKey(engine));
  const m = JSON.parse(key) as FooterModel;
  return (
    <div className={styles.footer} role="status" aria-live="polite">
      <span className={`${styles.footerText} ${m.tone === "danger" ? styles.danger : m.tone === "dim" ? styles.dim : ""}`}>{m.text}</span>
      {m.massDelete !== null ? (
        <button type="button" className={styles.deleteBtn} onClick={() => void engine.confirmMassDelete()}>
          Delete {m.massDelete} blocks in Notion
        </button>
      ) : null}
    </div>
  );
}
