import type { UnlistenFn } from "@tauri-apps/api/event";
import { on, stateEvents } from "../ipc/events";
import type { QueueState, Settings } from "../ipc/types";
import { useAuthStore } from "./authStore";
import { useGroupsStore } from "./groupsStore";
import { usePinsStore } from "./pinsStore";
import { useQueueStore } from "./queueStore";
import { useSettingsStore } from "./settingsStore";

/** Hydrates every persisted store once. Failures leave the store at its defaults. */
export async function hydrateAll(): Promise<void> {
  await Promise.allSettled([
    usePinsStore.getState().hydrate(),
    useGroupsStore.getState().hydrate(),
    useSettingsStore.getState().hydrate(),
    useAuthStore.getState().hydrate(),
    useQueueStore.getState().hydrate(),
  ]);
}

/** Subscribes to the Rust state events; returns one function that unsubscribes all of them. */
export async function startBridge(): Promise<() => void> {
  const unlisten: UnlistenFn[] = await Promise.all([
    on<unknown>(stateEvents.pins, (p) => usePinsStore.getState().applyChanged(p)),
    on<unknown>(stateEvents.groups, (p) => useGroupsStore.getState().applyChanged(p)),
    on<Partial<Settings> | null>(stateEvents.settings, (p) => useSettingsStore.getState().applyChanged(p)),
    on<unknown>(stateEvents.auth, (p) => useAuthStore.getState().applyChanged(p)),
    on<QueueState>(stateEvents.queue, (p) => useQueueStore.getState().applyChanged(p)),
  ]);
  return () => {
    for (const fn of unlisten) fn();
  };
}

/** `hydrateAll` then `startBridge`, in that order (events that fire in between trigger a refetch). */
export async function initState(): Promise<() => void> {
  const stop = await startBridge();
  await hydrateAll();
  return stop;
}
