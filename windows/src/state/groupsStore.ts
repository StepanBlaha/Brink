import { create } from "zustand";
import { groupsAdd, groupsDelete, groupsGet, groupsMove, groupsRename } from "../ipc/commands";
import { decodeGroups, type PinGroup } from "../domain/store/pin";
import { deleteGroup, moveGroups, renameGroup } from "../domain/store/pinOrdering";
import { usePinsStore } from "./pinsStore";

interface GroupsState {
  groups: PinGroup[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Applies a raw `groups://changed` payload. */
  applyChanged: (payload: unknown) => void;
  /** Creates a group; Rust assigns the id and order, the refetch brings them in. */
  add: (name: string, emoji?: string) => Promise<void>;
  rename: (id: string, name: string, emoji?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  move: (from: number[], to: number) => Promise<void>;
}

export const useGroupsStore = create<GroupsState>((set, get) => {
  const settle = async (call: () => Promise<void>): Promise<void> => {
    try {
      await call();
    } finally {
      // Rust owns ids and ordering; one refetch keeps both stores exact.
      await Promise.all([get().hydrate(), usePinsStore.getState().hydrate()]);
    }
  };
  return {
    groups: [],
    hydrated: false,
    async hydrate() {
      set({ groups: await groupsGet(), hydrated: true });
    },
    applyChanged(payload) {
      if (Array.isArray(payload)) set({ groups: decodeGroups(payload), hydrated: true });
      else void get().hydrate();
    },
    add: (name, emoji) => settle(() => groupsAdd(name, emoji)),
    rename: (id, name, emoji) => {
      set({ groups: renameGroup(get().groups, id, name, emoji) });
      return settle(() => groupsRename(id, name, emoji));
    },
    remove: (id) => {
      const next = deleteGroup(get().groups, usePinsStore.getState().pins, id);
      set({ groups: next.groups });
      usePinsStore.setState({ pins: next.pins });
      return settle(() => groupsDelete(id));
    },
    move: (from, to) => {
      set({ groups: moveGroups(get().groups, from, to) });
      return settle(() => groupsMove(from, to));
    },
  };
});
