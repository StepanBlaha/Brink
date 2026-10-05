import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settingsSet = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/commands", () => ({ settingsGet: vi.fn(), settingsSet }));
const soundTest = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/soundIpc", () => ({ soundTest }));
const windowOpen = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../ipc/windowsIpc", () => ({ windowOpen }));
const notifyStatus = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/notifyIpc", () => ({ notifyStatus }));

import { defaultSettings } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { GeneralSection } from "./GeneralSection";

beforeEach(() => {
  settingsSet.mockReset().mockImplementation(async (p: object) => ({ ...defaultSettings, ...p }));
  soundTest.mockReset();
  windowOpen.mockClear();
  notifyStatus.mockReset().mockResolvedValue("enabled");
  useSettingsStore.setState({ settings: { ...defaultSettings }, hydrated: true });
});
afterEach(cleanup);

const renderIt = async () => {
  render(<GeneralSection />);
  await act(async () => undefined);
};
const lastSet = () => settingsSet.mock.calls.at(-1)?.[0] as object;

describe("GeneralSection", () => {
  it("Sounds Test plays through the hub", async () => {
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(soundTest).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Sounds" }));
    expect(lastSet()).toEqual({ soundsEnabled: false });
  });

  it("saves Today, tray list and tray count; the count follows the list", async () => {
    await renderIt();
    fireEvent.click(screen.getByRole("switch", { name: "Show Today pin" }));
    expect(lastSet()).toEqual({ showTodayPin: false });
    fireEvent.click(screen.getByRole("switch", { name: "Show open count in the tray" }));
    expect(lastSet()).toEqual({ menuBarShowOpenCount: true });
    act(() => useSettingsStore.setState({ settings: { ...defaultSettings, menuBarListEnabled: false } }));
    expect(screen.getByRole("switch", { name: "Show open count in the tray" }).hasAttribute("disabled")).toBe(true);
  });

  it("reminder options appear only when reminders are on", async () => {
    await renderIt();
    expect(screen.queryByText("Remind date-only tasks at")).toBeNull();
    act(() => useSettingsStore.setState({ settings: { ...defaultSettings, remindersEnabled: true, morningSummaryEnabled: true } }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "14" } });
    expect(lastSet()).toEqual({ reminderHour: 14 });
    fireEvent.change(screen.getByLabelText("Summary time"), { target: { value: "07:30" } });
    expect(lastSet()).toEqual({ morningSummaryMinutes: 450 });
    expect(screen.getByRole("switch", { name: "Peek the notch for reminders" })).toBeTruthy();
  });

  it("warns when Windows blocks notifications", async () => {
    notifyStatus.mockResolvedValue("disabled");
    act(() => useSettingsStore.setState({ settings: { ...defaultSettings, remindersEnabled: true } }));
    await renderIt();
    expect(screen.getByText(/Notifications are turned off for Brink/)).toBeTruthy();
  });

  it("Show welcome again resets the flag and opens the window", async () => {
    useSettingsStore.setState({ settings: { ...defaultSettings, onboardingCompleted: true } });
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Show welcome again" }));
    expect(lastSet()).toEqual({ onboardingCompleted: false });
    expect(windowOpen).toHaveBeenCalledWith("onboarding");
  });
});
