import { invoke } from "@tauri-apps/api/core";

export type WindowName = "settings" | "onboarding" | "about" | "legal:privacy" | "legal:terms" | "legal:notice";
export type SettingsSection = "connection" | "appearance" | "general" | "groups" | "shortcuts";
export type AutostartStatus = "enabled" | "disabledByUser" | "off";

/** Shows (or builds) a utility window. `section` only applies to `settings`. */
export function windowOpen(name: WindowName, section?: SettingsSection): Promise<void> {
  return invoke("window_open", { name, section: section ?? null });
}

export const autostartStatus = (): Promise<AutostartStatus> => invoke<AutostartStatus>("autostart_status");
export const autostartSet = (enabled: boolean): Promise<AutostartStatus> => invoke<AutostartStatus>("autostart_set", { enabled });
export const launchedAtLogin = (): Promise<boolean> => invoke<boolean>("launched_at_login");
export const openStartupSettings = (): Promise<void> => invoke("open_startup_settings");

/** `0xRRGGBB` of the Windows accent color, or null when it cannot be read. */
export const systemAccent = (): Promise<number | null> => invoke<number | null>("system_accent");

export const settingsSectionEvent = "settings://section";

/** Sends Win+. so the emoji panel opens over the focused text field. */
export const emojiPanelOpen = (): Promise<void> => invoke("emoji_panel_open");

/** Onboarding "Add a page": the hub opens the add flow. */
export const OPEN_ADD_EVENT = "notch://open-add";

/** Windows text size in percent (100 to 225). */
export const textScale = (): Promise<number> => invoke<number>("text_scale");
