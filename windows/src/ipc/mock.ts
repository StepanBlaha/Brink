import { mockIPC } from "@tauri-apps/api/mocks";
import { createWorkspaceMock } from "./mockWorkspace";
import { defaultSettings, type Settings } from "./types";

/** True when running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Browser dev (`npm run dev:web`): answer commands with canned data. `?pins=0` starts empty. */
export function installMockIPC(): void {
  let settings: Settings = { ...defaultSettings };
  let autostart = "off";
  const pinsParam = Number(new URLSearchParams(window.location.search).get("pins") ?? 5);
  const workspace = createWorkspaceMock(Number.isNaN(pinsParam) ? 5 : Math.min(Math.max(pinsParam, 0), 5));
  mockIPC((cmd, payload) => {
    const handled = workspace(cmd, (payload ?? {}) as Record<string, unknown>);
    if (handled !== undefined) return handled;
    if (cmd === "app_version") return { marketing: "0.11.0", build: "3" };
    if (cmd === "queue_pending_count") return 0;
    if (cmd === "autostart_status") return autostart;
    if (cmd === "autostart_set") {
      autostart = (payload as { enabled?: boolean } | undefined)?.enabled ? "enabled" : "off";
      return autostart;
    }
    if (cmd === "launched_at_login") return false;
    if (cmd === "system_accent") return 0x0078d4;
    if (cmd === "oauth_available") return false;
    if (cmd === "queue_submit") return { kind: "saved" };
    if (cmd === "settings_get") return settings;
    if (cmd === "settings_set") {
      settings = { ...settings, ...((payload as { partial?: Partial<Settings> } | undefined)?.partial ?? {}) };
      return settings;
    }
    return null;
  });
}
