import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "../../domain/notion/searchResult";
import { notionSearch } from "../../ipc/commands";

export const SEARCH_DEBOUNCE_MS = 300;

export interface SearchState {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
}

export function errorMessage(e: unknown, fallback: string): string {
  if (typeof e === "object" && e !== null && "message" in e && typeof e.message === "string" && e.message !== "") return e.message;
  return typeof e === "string" && e !== "" ? e : fallback;
}

/**
 * Notion search while typing: the first search runs at once (empty query lists recent pages), the
 * next ones 300 ms after the last keystroke; an older answer never overwrites a newer query.
 */
export function usePinSearch(query: string, debounceMs = SEARCH_DEBOUNCE_MS): SearchState {
  const [state, setState] = useState<SearchState>({ results: [], loading: true, error: null });
  const first = useRef(true);
  useEffect(() => {
    let stale = false;
    const run = async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const results = await notionSearch(query.trim());
        if (!stale) setState({ results, loading: false, error: null });
      } catch (e) {
        if (!stale) setState({ results: [], loading: false, error: errorMessage(e, "Search failed.") });
      }
    };
    const timer = setTimeout(() => {
      first.current = false;
      void run();
    }, first.current ? 0 : debounceMs);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, debounceMs]);
  return state;
}
