import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { autostartSet, emojiPanelOpen, launchedAtLogin, systemAccent, windowOpen } from "./windowsIpc";

describe("windows IPC wrappers", () => {
  it("send the Rust command names and snake_case-able args", async () => {
    await windowOpen("settings", "groups");
    expect(invoke).toHaveBeenLastCalledWith("window_open", { name: "settings", section: "groups" });
    await windowOpen("legal:terms");
    expect(invoke).toHaveBeenLastCalledWith("window_open", { name: "legal:terms", section: null });
    await autostartSet(true);
    expect(invoke).toHaveBeenLastCalledWith("autostart_set", { enabled: true });
    await launchedAtLogin();
    expect(invoke).toHaveBeenLastCalledWith("launched_at_login");
    await systemAccent();
    expect(invoke).toHaveBeenLastCalledWith("system_accent");
    await emojiPanelOpen();
    expect(invoke).toHaveBeenLastCalledWith("emoji_panel_open");
  });
});
