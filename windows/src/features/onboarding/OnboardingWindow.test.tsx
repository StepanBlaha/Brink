import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cmd = vi.hoisted(() => ({
  authStatus: vi.fn(), authSaveToken: vi.fn(), authDisconnect: vi.fn(), authTestConnection: vi.fn(),
  oauthAvailable: vi.fn(), oauthStart: vi.fn(), settingsGet: vi.fn(), settingsSet: vi.fn(),
}));
vi.mock("../../ipc/commands", () => cmd);
vi.mock("../../ipc/captureIpc", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));
const emit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@tauri-apps/api/event", () => ({ emit, listen: vi.fn().mockResolvedValue(() => undefined) }));
const close = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ close }) }));
vi.mock("../../state/bridge", () => ({ initState: vi.fn().mockResolvedValue(() => undefined) }));

import { defaultSettings } from "../../ipc/types";
import { useAuthStore } from "../../state/authStore";
import { useSettingsStore } from "../../state/settingsStore";
import { OnboardingWindow } from "./OnboardingWindow";

let kind: "internal" | null = null;
beforeEach(() => {
  kind = null;
  cmd.authStatus.mockReset().mockImplementation(async () => ({ kind }));
  cmd.authSaveToken.mockReset().mockImplementation(async () => { kind = "internal"; });
  cmd.authTestConnection.mockReset().mockResolvedValue({ count: 2 });
  cmd.oauthAvailable.mockReset().mockResolvedValue(false);
  cmd.settingsSet.mockReset().mockImplementation(async (p: object) => ({ ...defaultSettings, ...p }));
  emit.mockClear();
  close.mockClear();
  useAuthStore.setState({ status: { kind: null }, hydrated: true });
  useSettingsStore.setState({ settings: { ...defaultSettings }, hydrated: true });
});
afterEach(cleanup);

const renderIt = async () => {
  render(<OnboardingWindow />);
  await act(async () => undefined);
};

describe("OnboardingWindow", () => {
  it("starts on the welcome step with the Mac copy and three dots", async () => {
    await renderIt();
    expect(screen.getByText("Your pages, on the edge.")).toBeTruthy();
    expect(screen.getByText(/check things off with one hover/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Step 1 of 3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("keeps the dots on their own layer, never inside the Back or primary button rows (the Mac fix)", async () => {
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    const dots = screen.getByRole("img", { name: "Step 2 of 3" });
    const back = screen.getByRole("button", { name: "Back" });
    const primary = screen.getByRole("button", { name: "Skip for now" });
    expect(dots.querySelectorAll("span")).toHaveLength(3);
    expect(dots.contains(back) || dots.contains(primary)).toBe(false);
    expect(back.parentElement).not.toBe(dots.parentElement);
    expect(primary.parentElement).toBe(dots.parentElement);
  });

  it("connect step: Skip for now without a token, Continue after a saved and tested token", async () => {
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(screen.getByText("Connect to Notion")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Step 2 of 3" })).toBeTruthy();
    const input = screen.getByLabelText("Integration token") as HTMLInputElement;
    expect(input.placeholder).toBe("secret_…");
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "secret_x" } });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(screen.getByText("Connected. Brink can see 2 pages.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(input.placeholder).toBe("Token saved");
  });

  it("Back returns, and the last step adds a page: flag saved, hub told, window closed", async () => {
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByText("Pin your first page")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Connect to Notion")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a page" }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(cmd.settingsSet).toHaveBeenCalledWith({ onboardingCompleted: true });
    expect(emit).toHaveBeenCalledWith("notch://open-add", null);
  });
});
