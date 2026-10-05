import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({ autostartStatus: vi.fn(), autostartSet: vi.fn(), openStartupSettings: vi.fn() }));
vi.mock("../../ipc/windowsIpc", () => ipc);

import { STARTUP_TEXT, StartupRow } from "./StartupRow";

beforeEach(() => {
  ipc.autostartStatus.mockReset().mockResolvedValue("off");
  ipc.autostartSet.mockReset().mockResolvedValue("enabled");
  ipc.openStartupSettings.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const renderIt = async () => {
  render(<StartupRow />);
  await act(async () => undefined);
};

describe("StartupRow", () => {
  it("is off and says so, then turns on", async () => {
    await renderIt();
    const sw = screen.getByRole("switch", { name: "Launch Brink when you sign in" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(STARTUP_TEXT.off)).toBeTruthy();
    fireEvent.click(sw);
    await act(async () => undefined);
    expect(ipc.autostartSet).toHaveBeenCalledWith(true);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Enabled.")).toBeTruthy();
  });

  it("turns off again", async () => {
    ipc.autostartStatus.mockResolvedValue("enabled");
    ipc.autostartSet.mockResolvedValue("off");
    await renderIt();
    fireEvent.click(screen.getByRole("switch"));
    await act(async () => undefined);
    expect(ipc.autostartSet).toHaveBeenCalledWith(false);
    expect(screen.getByText("Not enabled.")).toBeTruthy();
  });

  it("a Windows-side switch-off shows the copy and a button to Startup settings", async () => {
    ipc.autostartStatus.mockResolvedValue("disabledByUser");
    await renderIt();
    expect(screen.getByText("Turned off in Windows Settings, Apps, Startup.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Startup settings" }));
    expect(ipc.openStartupSettings).toHaveBeenCalled();
  });

  it("shows the error when the change fails", async () => {
    ipc.autostartSet.mockRejectedValue({ kind: "io", message: "Could not turn on launch at sign-in." });
    await renderIt();
    fireEvent.click(screen.getByRole("switch"));
    await act(async () => undefined);
    expect(screen.getByText("Could not turn on launch at sign-in.")).toBeTruthy();
  });
});
