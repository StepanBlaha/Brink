import { create } from "zustand";
import { groupsGet } from "../ipc/commands";
import { decodeGroups, type PinGroup } from "../domain/store/pin";

interface GroupsState {
  groups: PinGroup[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Applies a raw `groups://changed` payload. */
  applyChanged: (payload: unknown) => void;
}

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: [],
  hydrated: false,
  async hydrate() {
    set({ groups: await groupsGet(), hydrated: true });
  },
  applyChanged(payload) {
    if (Array.isArray(payload)) set({ groups: decodeGroups(payload), hydrated: true });
    else void get().hydrate();
  },
}));
