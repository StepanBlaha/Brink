import { invoke } from "@tauri-apps/api/core";
import type { ClipboardContent } from "../domain/capture/clipboardMapper";

/** Wrappers for the M7 window/clipboard commands (capture, toast, tray, deep links). */
export const captureShow = (): Promise<void> => invoke("capture_show");
export const captureHide = (): Promise<void> => invoke("capture_hide");
export const toastShow = (message: string, isError = false): Promise<void> =>
  invoke("toast_show", { message, isError });
export const trayFlyoutToggle = (): Promise<void> => invoke("tray_flyout_toggle");
export const trayFlyoutHide = (): Promise<void> => invoke("tray_flyout_hide");
export const traySetCount = (text: string): Promise<void> => invoke("tray_set_count", { text });
export const deeplinkReady = (): Promise<void> => invoke("deeplink_ready");
export const openUrl = (url: string): Promise<void> => invoke("open_url", { url });

interface ClipboardRead {
  kind: "text" | "image" | "empty";
  text?: string;
}

export async function clipboardRead(): Promise<ClipboardContent> {
  const r = await invoke<ClipboardRead>("clipboard_read");
  if (r.kind === "text") return { kind: "text", text: r.text ?? "" };
  return { kind: r.kind };
}

export const captureEvents = {
  shown: "capture://shown",
  prefill: "capture://prefill",
  toast: "toast://show",
  deeplink: "deeplink://open",
  hotkeyFired: "hotkey://fired",
  hotkeyFailed: "hotkey://failed",
} as const;

export interface HotkeyFired {
  action: "toggleLastPin" | "openPinN" | "quickCapture" | "clipboardAppend";
  index?: number;
}
