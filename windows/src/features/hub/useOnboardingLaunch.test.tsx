import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({ launchedAtLogin: vi.fn(), windowOpen: vi.fn() }));
vi.mock("../../ipc/windowsIpc", () => ipc);

import { defaultSettings } from "../../ipc/types";
import { useAuthStore } from "../../state/authStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useOnboardingLaunch } from "./useOnboardingLaunch";

function Probe() {
  useOnboardingLaunch();
  return null;
}
const setup = (completed: boolean, token: boolean, pins: number, hydrated = true) => {
  useSettingsStore.setState({ settings: { ...defaultSettings, onboardingCompleted: completed }, hydrated });
  useAuthStore.setState({ status: { kind: token ? "internal" : null }, hydrated });
  usePinsStore.setState({
    pins: Array.from({ length: pins }, (_, i) => ({ id: `p${i}`, notionId: `n${i}`, kind: "page" as const, title: "t", icon: { none: {} }, order: i })),
    hydrated,
  });
};

beforeEach(() => {
  ipc.launchedAtLogin.mockReset().mockResolvedValue(false);
  ipc.windowOpen.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("useOnboardingLaunch", () => {
  it("opens the welcome on a manual first launch", async () => {
    setup(false, false, 0);
    render(<Probe />);
    await act(async () => undefined);
    expect(ipc.windowOpen).toHaveBeenCalledWith("onboarding");
  });

  it("stays closed on a start from the Run key (autostart)", async () => {
    ipc.launchedAtLogin.mockResolvedValue(true);
    setup(false, false, 0);
    render(<Probe />);
    await act(async () => undefined);
    expect(ipc.windowOpen).not.toHaveBeenCalled();
  });

  it("stays closed when set up, and waits for the stores", async () => {
    setup(true, true, 2);
    render(<Probe />);
    await act(async () => undefined);
    expect(ipc.windowOpen).not.toHaveBeenCalled();
    cleanup();
    setup(false, false, 0, false);
    render(<Probe />);
    await act(async () => undefined);
    expect(ipc.windowOpen).not.toHaveBeenCalled();
  });

  it("opens again when completed but no token and no pins", async () => {
    setup(true, false, 0);
    render(<Probe />);
    await act(async () => undefined);
    expect(ipc.windowOpen).toHaveBeenCalledTimes(1);
  });
});
