import { mockIPC } from "@tauri-apps/api/mocks";
import { createWorkspaceMock } from "./mockWorkspace";
import { DEMO_PIN_SEEDS, DEMO_SETTINGS } from "../features/demo/demoContent";
import { demoFromSearch } from "../features/demo/demoFlag";
import { createDemoNotionMock } from "../features/demo/demoMock";
import { defaultSettings, type Settings } from "./types";

/** True when running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Browser dev (`npm run dev:web`): answer commands with canned data. `?pins=0` starts empty. */
export function installMockIPC(): void {
  (window as unknown as Record<string, unknown>)["__BRINK_MOCK_IPC__"] = true;
  const demo = demoFromSearch(window.location.search);
  const demoNotion = demo.enabled ? createDemoNotionMock() : undefined;
  let settings: Settings = { ...defaultSettings, ...(demo.enabled ? DEMO_SETTINGS : {}) };
  let autostart = "off";
  const pinsParam = Number(new URLSearchParams(window.location.search).get("pins") ?? 5);
  const count = Number.isNaN(pinsParam) ? 5 : Math.min(Math.max(pinsParam, 0), 5);
  const workspace = createWorkspaceMock(demo.enabled ? 4 : count, demo.enabled ? DEMO_PIN_SEEDS : undefined);
  mockIPC((cmd, payload) => {
    const args = (payload ?? {}) as Record<string, unknown>;
    if (cmd === "demo_state") return demo;
    if (cmd === "demo_mark") return null;
    if (cmd === "demo_wait") return false;
    const fromDemo = demoNotion?.(cmd, args);
    if (fromDemo !== undefined) return fromDemo;
    const handled = workspace(cmd, args);
    if (handled !== undefined) return handled;
    if (cmd === "app_version") return { marketing: "0.11.2", build: "3" };
    if (cmd === "queue_pending_count") return 0;
    if (cmd === "autostart_status") return autostart;
    if (cmd === "autostart_set") {
      autostart = (payload as { enabled?: boolean } | undefined)?.enabled ? "enabled" : "off";
      return autostart;
    }
    if (cmd === "launched_at_login") return false;
    if (cmd === "system_accent") return 0x0078d4;
    if (cmd === "text_scale") return Number(new URLSearchParams(window.location.search).get("textscale") ?? 100);
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
