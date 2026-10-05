import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  hotkeysSuspend: vi.fn(),
  hotkeysStatus: vi.fn(),
  onHotkeyFailed: vi.fn(),
}));
vi.mock("../../ipc/hotkeysIpc", () => ipc);
const settingsSet = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/commands", () => ({ settingsGet: vi.fn(), settingsSet }));

import { defaultSettings } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { ShortcutsSection, TOGGLE_HINT } from "./ShortcutsSection";

function setHotkeys(hotkeys: Record<string, string>) {
  useSettingsStore.setState({ settings: { ...defaultSettings, hotkeys }, hydrated: true });
}

beforeEach(() => {
  ipc.hotkeysStatus.mockReset().mockResolvedValue([]);
  ipc.onHotkeyFailed.mockReset().mockResolvedValue(() => undefined);
  settingsSet.mockReset().mockImplementation(async (p: object) => ({ ...defaultSettings, ...p }));
  setHotkeys({});
});
afterEach(cleanup);

const renderSection = async () => {
  render(<ShortcutsSection />);
  await act(async () => undefined);
};

describe("ShortcutsSection", () => {
  it("lists every action with defaults, the toggle hint and no Reset buttons", async () => {
    await renderSection();
    expect(screen.getByLabelText("Toggle last-opened pin").textContent).toBe("Alt+Space");
    expect(screen.getByLabelText("Open pin 1–9 of active group").textContent).toBe("Alt+1–9");
    expect(screen.getByLabelText("Quick capture").textContent).toBe("Alt+Shift+Space");
    expect(screen.getByLabelText("Append clipboard").textContent).toBe("Ctrl+Alt+V");
    expect(screen.getByText(TOGGLE_HINT)).toBeTruthy();
    expect(screen.queryByText("Reset")).toBeNull();
  });

  it("shows the conflict message and does not save", async () => {
    await renderSection();
    const field = screen.getByLabelText("Quick capture");
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: "Space", altKey: true });
    expect((await screen.findByRole("alert")).textContent).toBe('Alt+Space is already used by "Toggle last-opened pin".');
    expect(settingsSet).not.toHaveBeenCalled();
  });

  it("saves a free combo, then Reset removes it", async () => {
    await renderSection();
    const field = screen.getByLabelText("Append clipboard");
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: "KeyB", ctrlKey: true, altKey: true });
    await waitFor(() => expect(settingsSet).toHaveBeenCalledWith({ hotkeys: { clipboardAppend: "Ctrl+Alt+B" } }));
    await waitFor(() => expect(screen.getByLabelText("Append clipboard").textContent).toBe("Ctrl+Alt+B"));
    fireEvent.click(screen.getByText("Reset"));
    await waitFor(() => expect(settingsSet).toHaveBeenLastCalledWith({ hotkeys: {} }));
    await waitFor(() => expect(screen.queryByText("Reset")).toBeNull());
  });

  it("reset shows the default-in-use message when another action holds the default", async () => {
    setHotkeys({ toggleLastPin: "Ctrl+Alt+K", quickCapture: "Alt+Space" });
    await renderSection();
    fireEvent.click(screen.getAllByText("Reset")[0] as HTMLElement);
    expect(screen.getByRole("alert").textContent).toBe('Default is in use by "Quick capture"; change that one first.');
    expect(settingsSet).not.toHaveBeenCalled();
  });

  it("marks bindings another app holds", async () => {
    ipc.hotkeysStatus.mockResolvedValue([{ action: "toggleLastPin", ok: false }, { action: "quickCapture", ok: true }]);
    await renderSection();
    expect(screen.getAllByText("In use by another app")).toHaveLength(1);
  });
});
