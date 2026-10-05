import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "../../domain/notion/searchResult";
import { DatabaseIcon, FileTextIcon, SearchIcon } from "../common/icons";
import { AddFlowHeader } from "./AddFlowHeader";
import styles from "./pinning.module.css";
import { usePinSearch } from "./usePinSearch";

interface Props {
  /** Notion ids that already have a pin (accent check). */
  pinnedIds: ReadonlySet<string>;
  onPick: (r: SearchResult) => void;
  onClose: () => void;
}

export const EMPTY_COPY = "Not seeing a page? Share it with your integration in Notion (••• → Connections).";

function ResultIcon({ r }: { r: SearchResult }) {
  if (r.icon.type === "emoji") return <span className={styles.rowIcon} aria-hidden>{r.icon.emoji}</span>;
  return (
    <span className={styles.rowIcon} aria-hidden>
      {r.kind === "dataSource" ? <DatabaseIcon width={14} height={14} /> : <FileTextIcon width={14} height={14} />}
    </span>
  );
}

/** Step one of the add flow: search, up/down/Enter, click. Rows are the compact 30 px ones. */
export function PinSearch({ pinnedIds, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const { results, loading, error } = usePinSearch(query);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setIndex(0), [results]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) setIndex((i) => Math.max(0, Math.min(results.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[index];
      if (r) onPick(r);
    }
  };

  const body = useMemo(() => {
    if (loading && results.length === 0 && !error) return <div className={styles.center} role="status">Searching…</div>;
    if (error) return <div className={`${styles.center} ${styles.error}`} role="alert">{error}</div>;
    if (results.length === 0) return <div className={styles.center}>{EMPTY_COPY}</div>;
    return (
      <div className={styles.list} ref={list} role="listbox" aria-label="Search results">
        {results.map((r, i) => (
          <button
            key={r.id}
            type="button"
            role="option"
            aria-selected={i === index}
            data-index={i}
            className={`${styles.row} ${i === index ? styles.selected : ""}`}
            onMouseMove={() => setIndex(i)}
            onClick={() => onPick(r)}
          >
            <ResultIcon r={r} />
            <span className={styles.rowTitle}>{r.title === "" ? "Untitled" : r.title}</span>
            <span className={styles.kind}>{r.kind === "dataSource" ? "Database" : "Page"}</span>
            <span className={styles.tick} aria-label={pinnedIds.has(r.id) ? "Pinned" : undefined}>
              {pinnedIds.has(r.id) ? "✓" : ""}
            </span>
          </button>
        ))}
      </div>
    );
  }, [loading, results, error, index, pinnedIds, onPick]);

  return (
    <div className={styles.flow}>
      <AddFlowHeader title="Add a pin" onClose={onClose} />
      <label className={styles.search}>
        <SearchIcon width={13} height={13} />
        <input
          ref={input}
          value={query}
          placeholder={"Search Notion…"}
          aria-label="Search Notion"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
      </label>
      {body}
    </div>
  );
}
