import { create } from "zustand";
import { pinsGet } from "../ipc/commands";
import { decodePins, type Pin } from "../domain/store/pin";

interface PinsState {
  pins: Pin[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Applies a raw `pins://changed` payload. */
  applyChanged: (payload: unknown) => void;
}

export const usePinsStore = create<PinsState>((set, get) => ({
  pins: [],
  hydrated: false,
  async hydrate() {
    set({ pins: await pinsGet(), hydrated: true });
  },
  applyChanged(payload) {
    if (Array.isArray(payload)) set({ pins: decodePins(payload), hydrated: true });
    else void get().hydrate();
  },
}));
