/** Engine timing constants (PageEditorEngine defaults, PORT 3.c.6). Each has a test. */
export const engineConfig = {
  /** Quiet time after the last local edit before a sync starts. */
  debounceMs: 700,
  /** Remote refresh poll while the page is open. */
  pollIntervalMs: 45_000,
  /** A remote refresh only applies when no local edit happened for this long. */
  remoteQuietPeriodMs: 5_000,
  /** Retry after a transient failure. */
  retryIntervalMs: 15_000,
  /** Max passes per syncNow while syncAgain is set. */
  maxPasses: 5,
  /** The restored-token hint stays this long. */
  restoredHintMs: 4_000,
  /** Flush on quit waits at most this long. */
  flushOnQuitMs: 3_000,
  /** Children are fetched only below this depth. */
  maxFetchDepth: 3,
  /** Single-part upload limit. */
  singlePartUploadLimit: 20 * 1024 * 1024,
} as const;

export type EngineTimings = {
  debounceMs: number;
  pollIntervalMs: number;
  remoteQuietPeriodMs: number;
  retryIntervalMs: number;
};
