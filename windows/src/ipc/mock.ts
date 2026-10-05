import { mockIPC } from "@tauri-apps/api/mocks";
import { defaultSettings, type Settings } from "./types";

/** True when running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Browser dev (`npm run dev:web`): answer commands with canned data. */
export function installMockIPC(): void {
  let settings: Settings = { ...defaultSettings };
  mockIPC((cmd, payload) => {
    if (cmd === "app_version") return { marketing: "0.10.0", build: "2" };
    // M1 state commands (empty workspace).
    if (cmd === "pins_get" || cmd === "groups_get") return [];
    if (cmd === "auth_status") return { kind: null };
    if (cmd === "queue_pending_count") return 0;
    if (cmd === "notion_search") return { results: [] };
    if (cmd === "settings_get") return settings;
    if (cmd === "settings_set") {
      settings = { ...settings, ...((payload as { partial?: Partial<Settings> } | undefined)?.partial ?? {}) };
      return settings;
    }
    return null;
  });
}
