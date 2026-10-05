import { useEffect, useMemo, useSyncExternalStore } from "react";
import { PageEditorEngine } from "../domain/editor/engine";
import type { EngineApi, EngineCache } from "../domain/editor/ports";
import { openInNotion } from "../ipc/commands";
import { BrinkEditor } from "./BrinkEditor";
import { CoverStrip, type CoverResolver } from "./CoverStrip";
import { EditorFooter } from "./EditorFooter";
import { makeEmbedDatabase } from "./embedDatabase";
import { wireImages } from "./imageWiring";
import { createBrinkDoc } from "./setup";
import type { DatabasePorts } from "../features/database/ports";
import styles from "./editor.module.css";

interface Props {
  pageId: string;
  api: EngineApi;
  cache?: EngineCache;
  fontScale?: number;
  onOverlay?: (open: boolean) => void;
  onOpenToken?: (blockId: string) => void;
  resolveCover?: CoverResolver;
  /** Ports for embedded databases (the app uses IPC). */
  dbPorts?: DatabasePorts;
}

/** Panel body for a page pin: engine + ProseMirror document + editor (the page-pin analog of DatabaseHost). */
export function PageHost({ pageId, api, cache, fontScale, onOverlay, onOpenToken, resolveCover, dbPorts }: Props) {
  const { doc, engine } = useMemo(() => {
    const d = createBrinkDoc();
    return { doc: d, engine: new PageEditorEngine({ pageId, api, doc: d, ...(cache ? { cache } : {}) }) };
  }, [pageId, api, cache]);
  const embed = useMemo(() => makeEmbedDatabase(dbPorts), [dbPorts]);
  useEffect(() => {
    const unwire = wireImages(doc, engine);
    void engine.load();
    return () => { unwire(); void engine.stopPolling().finally(() => engine.dispose()); };
  }, [engine, doc]);
  const coverUrl = useSyncExternalStore((fn) => engine.subscribe(fn), () => engine.cover?.url ?? "");
  return (
    <div className={styles.page}>
      {engine.cover && coverUrl !== "" ? <CoverStrip cover={engine.cover} pageId={pageId} {...(resolveCover ? { resolve: resolveCover } : {})} /> : null}
      <div className={styles.pageBody}>
        <BrinkEditor
          doc={doc} embed={embed} onError={(m) => engine.setError(m)}
          {...(fontScale ? { fontScale } : {})} {...(onOverlay ? { onOverlay } : {})}
          onOpenToken={onOpenToken ?? ((id) => void openInNotion(id))}
        />
      </div>
      <EditorFooter engine={engine} />
    </div>
  );
}
