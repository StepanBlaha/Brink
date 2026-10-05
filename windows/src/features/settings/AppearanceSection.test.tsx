import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settingsSet = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/commands", () => ({ settingsGet: vi.fn(), settingsSet }));
vi.mock("../../ipc/windowsIpc", () => ({
  systemAccent: vi.fn().mockResolvedValue(0x0078d4),
  autostartStatus: vi.fn().mockResolvedValue("off"),
  autostartSet: vi.fn(),
  openStartupSettings: vi.fn(),
}));
vi.mock("../notch/useSettingsSync", () => ({ listScreens: vi.fn().mockResolvedValue([]) }));

import { defaultSettings } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { AppearanceSection } from "./AppearanceSection";

beforeEach(() => {
  settingsSet.mockReset().mockImplementation(async (p: object) => ({ ...defaultSettings, ...p }));
  useSettingsStore.setState({ settings: { ...defaultSettings }, hydrated: true });
});
afterEach(cleanup);

const renderIt = async () => {
  render(<AppearanceSection />);
  await act(async () => undefined);
};
const lastSet = () => settingsSet.mock.calls.at(-1)?.[0] as object;

describe("AppearanceSection", () => {
  it("lists the eleven accents, the system one last, and saves a pick", async () => {
    await renderIt();
    const accents = screen.getAllByRole("radio", { name: /^(Pink|Red|Orange|Yellow|Green|Teal|Blue|Indigo|Purple|Off-White|System accent)$/ });
    expect(accents).toHaveLength(11);
    expect(accents.at(-1)?.textContent).toBe("System accent");
    expect(screen.getByRole("radio", { name: "Blue" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Pink" }));
    expect(lastSet()).toEqual({ accentPreset: "pink" });
  });

  it("saves size, edge, badge, pill and progress choices", async () => {
    await renderIt();
    fireEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(lastSet()).toEqual({ dockSize: "large" });
    fireEvent.click(screen.getByRole("radio", { name: "Left" }));
    expect(lastSet()).toEqual({ dockEdge: "left" });
    fireEvent.click(screen.getByRole("radio", { name: "Due today" }));
    expect(lastSet()).toEqual({ badgeMode: "dueToday" });
    fireEvent.click(screen.getByRole("radio", { name: "Dot" }));
    expect(lastSet()).toEqual({ pillStyle: "dot" });
    fireEvent.click(screen.getByRole("radio", { name: "Last pin" }));
    expect(lastSet()).toEqual({ pillProgressMode: "lastPin" });
  });

  it("explains that the top position is centered, only for the top edge", async () => {
    await renderIt();
    expect(screen.queryByText(/centered on your screen/)).toBeNull();
    act(() => useSettingsStore.setState({ settings: { ...defaultSettings, dockEdge: "top" } }));
    expect(screen.getByText("The top position sits centered on your screen.")).toBeTruthy();
  });

  it("shows the 7/12 and 58% choice only for the percent pill", async () => {
    await renderIt();
    expect(screen.queryByRole("radio", { name: "58%" })).toBeNull();
    act(() => useSettingsStore.setState({ settings: { ...defaultSettings, pillStyle: "percent" } }));
    fireEvent.click(screen.getByRole("radio", { name: "58%" }));
    expect(lastSet()).toEqual({ pillShowsFraction: false });
  });

  it("toggles the outline and picks a display", async () => {
    await renderIt();
    fireEvent.click(screen.getByRole("switch", { name: "Light edge around the notch" }));
    expect(lastSet()).toEqual({ notchOutline: false });
    fireEvent.change(screen.getByLabelText("Display"), { target: { value: "mouse" } });
    expect(lastSet()).toEqual({ displayPreference: "mouse" });
  });

  it("arrow keys move a segmented choice", async () => {
    await renderIt();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Medium" }), { key: "ArrowRight" });
    expect(lastSet()).toEqual({ dockSize: "large" });
  });
});
