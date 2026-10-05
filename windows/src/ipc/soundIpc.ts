import { emit } from "@tauri-apps/api/event";

/** Other windows ask the hub window to play the tick (plan 3.j). */
export const soundEvents = { tick: "sound://tick", test: "sound://test" } as const;

export const soundTick = (): void => void emit(soundEvents.tick, null).catch(() => {});
/** Settings "Test": plays even when sounds are off. */
export const soundTest = (): void => void emit(soundEvents.test, null).catch(() => {});
