import { useEffect, useMemo, useRef } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { openInNotion } from "../../ipc/commands";
import { PageHost } from "../../editor/PageHost";
import { ipcEngineApi, ipcEngineCache } from "../../editor/ipcEngineApi";
import { cacheKey, displayTitle, type RowPageTarget } from "./rowPageTarget";
import styles from "./rowPage.module.css";

/** The row's page in the existing editor, cached apart from the pin (`row-<id>`). */
export function RowPageEditor({ target }: { target: RowPageTarget }) {
  const key = cacheKey(target);
  const cache = useMemo(() => ipcEngineCache(key), [key]);
  return <PageHost pageId={target.rowId} api={ipcEngineApi} cache={cache} />;
}

interface Props {
  target: RowPageTarget;
  onBack: () => void;
  openExternal?: (id: string) => void;
  /** The page body; the app uses the editor, tests pass a stub. */
  renderPage?: (target: RowPageTarget) => React.ReactNode;
}

/** Header (back, row title, Open in Notion) over the row's page editor. */
export function RowPageView({ target, onBack, openExternal = (id) => void openInNotion(id).catch(() => {}), renderPage }: Props) {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus({ preventScroll: true }), []);
  return (
    <section className={styles.page} aria-label={`Page: ${displayTitle(target)}`}>
      <header className={styles.header}>
        <button ref={backRef} type="button" className={styles.btn} aria-label="Back to list" title="Back to list" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden />
        </button>
        <h2 className={styles.title}>{displayTitle(target)}</h2>
        <button type="button" className={styles.btn} aria-label="Open in Notion" title="Open in Notion" onClick={() => openExternal(target.rowId)}>
          <ExternalLink size={13} aria-hidden />
        </button>
      </header>
      <div className={styles.body}>{renderPage ? renderPage(target) : <RowPageEditor target={target} />}</div>
    </section>
  );
}
