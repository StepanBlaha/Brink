import { mockIPC } from "@tauri-apps/api/mocks";

/** True when running inside a Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Browser dev (`npm run dev:web`): answer commands with canned data. */
export function installMockIPC(): void {
  mockIPC((cmd) => {
    if (cmd === "app_version") return { marketing: "0.10.0", build: "2" };
    return null;
  });
}
