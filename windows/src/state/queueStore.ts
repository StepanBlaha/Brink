import { create } from "zustand";
import { queuePendingCount } from "../ipc/commands";
import type { QueueState } from "../ipc/types";

interface QueueStoreState extends QueueState {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Applies a `queue://changed { pending, lastError }` payload. */
  applyChanged: (payload: QueueState) => void;
}

export const useQueueStore = create<QueueStoreState>((set) => ({
  pending: 0,
  lastError: null,
  hydrated: false,
  async hydrate() {
    set({ pending: await queuePendingCount(), hydrated: true });
  },
  applyChanged(payload) {
    set({ pending: payload.pending, lastError: payload.lastError ?? null, hydrated: true });
  },
}));
