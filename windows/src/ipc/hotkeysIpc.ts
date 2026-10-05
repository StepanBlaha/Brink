import { invoke } from "@tauri-apps/api/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { on } from "./events";

export interface HotkeyResult {
  action: string;
  ok: boolean;
  error?: string;
}

export interface HotkeyFailure {
  action: string;
  accelerator: string;
}

/** Wrappers tolerate a missing backend (web dev, older Rust build): they resolve to a harmless value. */
export async function hotkeysApply(bindings: Record<string, string>): Promise<HotkeyResult[]> {
  try {
    return (await invoke<HotkeyResult[] | null>("hotkeys_apply", { bindings })) ?? [];
  } catch {
    return [];
  }
}

/** While `on` is true no global hotkey fires, so a recorder can see the combo. */
export async function hotkeysSuspend(on: boolean): Promise<void> {
  try {
    await invoke("hotkeys_suspend", { on });
  } catch {
    /* no backend */
  }
}

export async function hotkeysStatus(): Promise<HotkeyResult[]> {
  try {
    return (await invoke<HotkeyResult[] | null>("hotkeys_status")) ?? [];
  } catch {
    return [];
  }
}

export const hotkeyEvents = { failed: "hotkey://failed" } as const;

export function onHotkeyFailed(handler: (failure: HotkeyFailure) => void): Promise<UnlistenFn> {
  return on<HotkeyFailure>(hotkeyEvents.failed, handler);
}
