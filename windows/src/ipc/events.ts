import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Typed event subscription helper; later milestones add the event names. */
export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

/** Rust event names emitted for persisted state (plan 2.3). */
export const stateEvents = {
  pins: "pins://changed",
  groups: "groups://changed",
  settings: "settings://changed",
  auth: "auth://changed",
  queue: "queue://changed",
} as const;
