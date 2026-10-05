import { emit } from "@tauri-apps/api/event";
import { on } from "../ipc/events";
import { useSummaryStore } from "./summaryStore";

/** The hub owns the summaries (D6); the tray flyout gets the open counts through these events. */
export const summaryEvents = {
  changed: "summaries://changed",
  request: "summaries://request",
  contentChanged: "pin://content-changed",
} as const;

export type OpenCounts = Record<string, { openCount: number }>;

export function openCountsOf(summaries: Record<string, { openCount: number }>): OpenCounts {
  return Object.fromEntries(Object.entries(summaries).map(([id, s]) => [id, { openCount: s.openCount }]));
}

const BROADCAST_DELAY_MS = 200;

/** Hub side: sends the counts when they change (debounced) and when a window asks. */
export function startSummaryBroadcast(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = (): void => void emit(summaryEvents.changed, openCountsOf(useSummaryStore.getState().summaries)).catch(() => {});
  const unsub = useSummaryStore.subscribe((s, prev) => {
    if (s.summaries === prev.summaries) return;
    clearTimeout(timer);
    timer = setTimeout(send, BROADCAST_DELAY_MS);
  });
  const sub = on<null>(summaryEvents.request, send);
  return () => {
    unsub();
    clearTimeout(timer);
    void sub.then((f) => f());
  };
}

let received: OpenCounts = {};
export const receivedCounts = (): OpenCounts => received;
export const setReceivedCounts = (c: OpenCounts): void => {
  received = c;
};

export const requestCounts = (): void => void emit(summaryEvents.request, null).catch(() => {});

/** Window side (tray): keeps the latest counts and asks the hub for them now. */
export async function startSummaryReceiver(onChange: () => void): Promise<() => void> {
  const sub = await on<OpenCounts>(summaryEvents.changed, (c) => {
    received = c;
    onChange();
  });
  requestCounts();
  return () => sub();
}

export const announceContentChanged = (pinId: string): void =>
  void emit(summaryEvents.contentChanged, { pinId }).catch(() => {});
