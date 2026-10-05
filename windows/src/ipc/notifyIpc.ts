import { invoke } from "@tauri-apps/api/core";
import type { ReminderRequest } from "../domain/store/reminderPlanner";

/** Wire shape of `NotifyRequest` in Rust (camelCase, fire time in epoch ms). */
export interface NotifyWire {
  identifier: string;
  kind: "item" | "summary" | "snooze";
  title: string;
  body: string;
  fireAtMs: number;
  pinId?: string;
  itemId?: string;
}

export const toWire = (r: ReminderRequest | (Omit<ReminderRequest, "kind"> & { kind: "snooze" })): NotifyWire => ({
  identifier: r.identifier, kind: r.kind, title: r.title, body: r.body, fireAtMs: r.fireDate.getTime(),
  ...(r.pinId !== undefined ? { pinId: r.pinId } : {}),
  ...(r.itemId !== undefined ? { itemId: r.itemId } : {}),
});

/** `enabled`, or the Windows reason notifications are off. Resolves `enabled` without a backend (web dev). */
export async function notifyStatus(): Promise<string> {
  try {
    return (await invoke<{ permission: string } | null>("notify_status"))?.permission ?? "enabled";
  } catch {
    return "enabled";
  }
}

export async function notifyPending(): Promise<NotifyWire[]> {
  try {
    return (await invoke<NotifyWire[] | null>("notify_pending")) ?? [];
  } catch {
    return [];
  }
}

export async function notifyApply(add: NotifyWire[], remove: string[]): Promise<void> {
  try {
    await invoke("notify_apply", { add, remove });
  } catch {
    // Best effort: the next reschedule retries.
  }
}
