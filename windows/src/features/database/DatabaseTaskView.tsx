import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { PlusIcon } from "../notch/icons";
import { DatabaseRow } from "./DatabaseRow";
import type { DatabaseModel } from "./databaseModel";
import { useDatabase } from "./useDatabase";
import styles from "./database.module.css";

export const compactRowLimit = 8;

interface Props {
  model: DatabaseModel;
  compact?: boolean;
}

/** Task list for a database: quick add, checkbox/status rows, date chips, "Show completed". */
export function DatabaseTaskView({ model, compact = false }: Props) {
  const s = useDatabase(model);
  const [title, setTitle] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    void model.load();
    if (compact) return undefined;
    model.startPolling();
    return () => model.stopPolling();
  }, [model, compact]);

  const visible = compact && !all ? s.rows.slice(0, compactRowLimit) : s.rows;
  const list = (
    <>
      <AnimatePresence initial={false}>
        {visible.map((r) => (
          <DatabaseRow key={r.id} model={model} row={r} animatingOut={s.animatingOut.has(r.id)} />
        ))}
      </AnimatePresence>
      {compact && !all && s.rows.length > compactRowLimit && (
        <button type="button" className={styles.link} onClick={() => setAll(true)}>
          Show all {s.rows.length}
        </button>
      )}
      {!model.isReadOnly && (
        <button type="button" className={styles.link} onClick={() => void model.setShowDone(!s.showDone)}>
          <span className={`${styles.miniBox} ${s.showDone ? styles.miniOn : ""}`} aria-hidden />
          Show completed
        </button>
      )}
    </>
  );

  return (
    <div className={`${styles.view} ${compact ? styles.compact : ""}`}>
      {compact && <div className={styles.caption}>{s.schema?.name ?? "Tasks"}</div>}
      <form
        className={styles.quick}
        onSubmit={(e) => {
          e.preventDefault();
          const t = title;
          setTitle("");
          void model.quickAdd(t);
        }}
      >
        <PlusIcon width={12} height={12} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" aria-label="Add a task" />
      </form>
      {s.errorMessage && <div className={styles.error} role="alert">{s.errorMessage}</div>}
      {s.isLoading && s.rows.length === 0 ? (
        <div className={styles.loading} aria-busy="true">Loading…</div>
      ) : s.rows.length === 0 ? (
        <div className={styles.empty}>No open tasks 🎉</div>
      ) : compact ? (
        <div>{list}</div>
      ) : (
        <div className={styles.scroll}>{list}</div>
      )}
    </div>
  );
}
