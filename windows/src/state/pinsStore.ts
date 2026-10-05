import { create } from "zustand";
import {
  pinsAdd, pinsGet, pinsMoveAmongAll, pinsMoveWithinGroup, pinsRemove, pinsSetGroup, pinsUpdate,
} from "../ipc/commands";
import { decodePins, type Pin } from "../domain/store/pin";
import {
  addPin, movePinAmongAll, movePinWithinGroup, removePin, setPinGroup, updatePin,
} from "../domain/store/pinOrdering";

interface PinsState {
  pins: Pin[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Applies a raw `pins://changed` payload. */
  applyChanged: (payload: unknown) => void;
  /** Mutations apply locally first (the drop feels instant), then persist through Rust. */
  add: (pin: Pin) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (pin: Pin) => Promise<void>;
  /** `groupId` undefined = reorder among all pins. */
  move: (pinId: string, toIndex: number, groupId: string | undefined) => Promise<void>;
  setGroup: (pinId: string, groupId: string | undefined) => Promise<void>;
}

export const usePinsStore = create<PinsState>((set, get) => {
  /** Applies `next` locally, runs the IPC call, and resyncs from Rust when it fails. */
  const mutate = async (next: (pins: Pin[]) => Pin[], call: () => Promise<void>): Promise<void> => {
    set({ pins: next(get().pins) });
    try {
      await call();
    } catch (e) {
      await get().hydrate();
      throw e;
    }
  };
  return {
    pins: [],
    hydrated: false,
    async hydrate() {
      set({ pins: await pinsGet(), hydrated: true });
    },
    applyChanged(payload) {
      if (Array.isArray(payload)) set({ pins: decodePins(payload), hydrated: true });
      else void get().hydrate();
    },
    add: (pin) => mutate((p) => addPin(p, pin), () => pinsAdd(pin)),
    remove: (id) => mutate((p) => removePin(p, id), () => pinsRemove(id)),
    update: (pin) => mutate((p) => updatePin(p, pin), () => pinsUpdate(pin)),
    move: (pinId, toIndex, groupId) =>
      mutate(
        (p) => (groupId === undefined ? movePinAmongAll(p, pinId, toIndex) : movePinWithinGroup(p, pinId, toIndex, groupId)),
        () => (groupId === undefined ? pinsMoveAmongAll(pinId, toIndex) : pinsMoveWithinGroup(pinId, toIndex, groupId)),
      ),
    setGroup: (pinId, groupId) => mutate((p) => setPinGroup(p, pinId, groupId), () => pinsSetGroup(pinId, groupId)),
  };
});
