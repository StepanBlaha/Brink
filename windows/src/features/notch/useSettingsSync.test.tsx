import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const monitors = vi.hoisted(() => ({ availableMonitors: vi.fn(), cursorPosition: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => monitors);
vi.mock("./notchBridge", () => ({ inTauri: () => true }));

import { defaultSettings, type Settings } from "../../ipc/types";
import { useNotchStore } from "../../state/notchStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useSettingsSync } from "./useSettingsSync";

function Probe() {
  useSettingsSync();
  return null;
}
const mon = (name: string, x: number) => ({ name, position: { x, y: 0 }, size: { width: 1920, height: 1080 } });
const set = (p: Partial<Settings>) => act(() => useSettingsStore.setState({ settings: { ...defaultSettings, ...p } }));

beforeEach(() => {
  vi.useFakeTimers();
  monitors.availableMonitors.mockReset().mockResolvedValue([mon("A", 0), mon("B", 1920)]);
  monitors.cursorPosition.mockReset().mockResolvedValue({ x: 100, y: 100 });
  useNotchStore.setState({ monitor: null });
  useNotchStore.getState().setConfig({ edge: "right", size: "medium", pill: "line", outline: false });
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSettingsSync", () => {
  it("applies edge, size, pill and outline from settings, live", () => {
    render(<Probe />);
    set({ dockEdge: "top", dockSize: "large", pillStyle: "dot", notchOutline: false });
    const c = useNotchStore.getState().config;
    expect([c.edge, c.size, c.pill, c.outline]).toEqual(["top", "large", "dot", false]);
    set({ dockEdge: "left" });
    expect(useNotchStore.getState().config.edge).toBe("left");
  });

  it("a debug query param wins over the setting", () => {
    window.history.replaceState(null, "", "/?edge=right");
    render(<Probe />);
    set({ dockEdge: "left" });
    expect(useNotchStore.getState().config.edge).toBe("right");
  });

  it("main display means the primary monitor", () => {
    render(<Probe />);
    set({ displayPreference: "main" });
    expect(useNotchStore.getState().monitor).toBeNull();
  });

  it("a named display resolves to its monitor index", async () => {
    render(<Probe />);
    set({ displayPreference: "screen:B\t1920,0,1920,1080" });
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(useNotchStore.getState().monitor).toBe(1);
  });

  it("the mouse display follows the cursor", async () => {
    render(<Probe />);
    set({ displayPreference: "mouse" });
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(useNotchStore.getState().monitor).toBe(0);
    monitors.cursorPosition.mockResolvedValue({ x: 2500, y: 10 });
    await act(async () => void (await vi.advanceTimersByTimeAsync(1600)));
    expect(useNotchStore.getState().monitor).toBe(1);
  });
});
