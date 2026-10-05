import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const systemAccent = vi.hoisted(() => vi.fn());
vi.mock("../ipc/windowsIpc", () => ({ systemAccent }));

import { defaultSettings } from "../ipc/types";
import { startAppearance } from "./appearance";
import { useSettingsStore } from "./settingsStore";

const accent = () => document.documentElement.style.getPropertyValue("--accent");
const set = (accentPreset: (typeof defaultSettings)["accentPreset"]) =>
  useSettingsStore.setState({ settings: { ...defaultSettings, accentPreset } });

beforeEach(() => {
  vi.useFakeTimers();
  systemAccent.mockReset().mockResolvedValue(0x0078d4);
  set("blue");
});
afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute("style");
});

describe("startAppearance", () => {
  it("applies the preset at once and on every change", () => {
    const stop = startAppearance();
    expect(accent()).toBe("#0a84ff");
    set("pink");
    expect(accent()).toBe("#ff375f");
    expect(document.documentElement.style.getPropertyValue("--on-accent")).toBe("#fff");
    set("yellow");
    expect(document.documentElement.style.getPropertyValue("--on-accent")).toBe("#000");
    stop();
  });

  it("the system preset follows the Windows accent and re-reads it", async () => {
    const stop = startAppearance();
    set("system");
    await vi.advanceTimersByTimeAsync(0);
    expect(accent()).toBe("#0078d4");
    systemAccent.mockResolvedValue(0xd13438);
    await vi.advanceTimersByTimeAsync(5000);
    expect(accent()).toBe("#d13438");
    stop();
  });

  it("falls back to blue when Windows gives no accent, and stops polling for other presets", async () => {
    systemAccent.mockResolvedValue(null);
    const stop = startAppearance();
    set("system");
    await vi.advanceTimersByTimeAsync(0);
    expect(accent()).toBe("#0a84ff");
    set("green");
    systemAccent.mockClear();
    await vi.advanceTimersByTimeAsync(20000);
    expect(systemAccent).not.toHaveBeenCalled();
    stop();
  });
});
