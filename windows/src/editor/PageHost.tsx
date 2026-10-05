import { useEffect, useMemo, useSyncExternalStore } from "react";
import { PageEditorEngine, statusLabel } from "../domain/editor/engine";
import type { EngineApi, EngineCache } from "../domain/editor/ports";
import { openInNotion } from "../ipc/commands";
import { BrinkEditor } from "./BrinkEditor";
import { createBrinkDoc } from "./setup";
import styles from "./editor.module.css";

interface Props {
  pageId: string;
  api: EngineApi;
  cache?: EngineCache;
  fontScale?: number;
  onOverlay?: (open: boolean) => void;
  onOpenToken?: (blockId: string) => void;
}

/** Panel body for a page pin: engine + ProseMirror document + editor (the page-pin analog of DatabaseHost). */
export function PageHost({ pageId, api, cache, fontScale, onOverlay, onOpenToken }: Props) {
  const { doc, engine } = useMemo(() => {
    const d = createBrinkDoc();
    return { doc: d, engine: new PageEditorEngine({ pageId, api, doc: d, ...(cache ? { cache } : {}) }) };
  }, [pageId, api, cache]);
  useEffect(() => {
    void engine.load();
    return () => { void engine.stopPolling().finally(() => engine.dispose()); };
  }, [engine]);
  const status = useSyncExternalStore((fn) => engine.subscribe(fn), () => engine.status);
  return (
    <div className={styles.page}>
      <div className={styles.pageBody}>
        <BrinkEditor doc={doc} {...(fontScale ? { fontScale } : {})} {...(onOverlay ? { onOverlay } : {})} onOpenToken={onOpenToken ?? ((id) => void openInNotion(id))} />
      </div>
      <div className={styles.status} aria-live="polite">{engine.errorMessage ?? statusLabel(status)}</div>
    </div>
  );
}
