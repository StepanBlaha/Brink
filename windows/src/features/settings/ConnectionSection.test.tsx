import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cmd = vi.hoisted(() => ({
  authStatus: vi.fn(),
  authSaveToken: vi.fn(),
  authDisconnect: vi.fn(),
  authTestConnection: vi.fn(),
  oauthAvailable: vi.fn(),
  oauthStart: vi.fn(),
}));
vi.mock("../../ipc/commands", () => cmd);
vi.mock("../../ipc/captureIpc", () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }));

import { useAuthStore } from "../../state/authStore";
import { ConnectionSection } from "./ConnectionSection";

let kind: "internal" | null = null;
beforeEach(() => {
  kind = null;
  cmd.authStatus.mockReset().mockImplementation(async () => ({ kind }));
  cmd.authSaveToken.mockReset().mockImplementation(async () => { kind = "internal"; });
  cmd.authDisconnect.mockReset().mockImplementation(async () => { kind = null; });
  cmd.authTestConnection.mockReset().mockResolvedValue({ count: 3 });
  cmd.oauthAvailable.mockReset().mockResolvedValue(false);
  cmd.oauthStart.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ status: { kind: null }, hydrated: true });
});
afterEach(cleanup);

const renderIt = async () => {
  render(<ConnectionSection />);
  await act(async () => undefined);
};

describe("ConnectionSection", () => {
  it("shows the secret placeholder, saves, tests and reports the item count", async () => {
    await renderIt();
    const input = screen.getByLabelText("Integration token") as HTMLInputElement;
    expect(input.placeholder).toBe("secret_…");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(input, { target: { value: "  secret_abc  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("Connected. Brink can see 3 items.")).toBeTruthy());
    expect(cmd.authSaveToken).toHaveBeenCalledWith("secret_abc");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Token saved");
  });

  it("says item for one", async () => {
    cmd.authTestConnection.mockResolvedValue({ count: 1 });
    kind = "internal";
    useAuthStore.setState({ status: { kind: "internal" } });
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(screen.getByText("Connected. Brink can see 1 item.")).toBeTruthy());
  });

  it("shows the error text when the test fails", async () => {
    cmd.authTestConnection.mockRejectedValue({ kind: "unauthorized", message: "Notion refused the token." });
    useAuthStore.setState({ status: { kind: "internal" } });
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Notion refused the token."));
  });

  it("Disconnect clears the credentials and disables Test", async () => {
    kind = "internal";
    useAuthStore.setState({ status: { kind: "internal" } });
    await renderIt();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(cmd.authDisconnect).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Test connection" }).hasAttribute("disabled")).toBe(true));
  });

  it("hides the Notion sign-in while OAuth is not available", async () => {
    await renderIt();
    expect(screen.queryByRole("button", { name: "Connect to Notion" })).toBeNull();
  });

  it("offers the sign-in when OAuth is available, with the token as the fallback", async () => {
    cmd.oauthAvailable.mockResolvedValue(true);
    await renderIt();
    expect(screen.getByRole("button", { name: "Connect to Notion" })).toBeTruthy();
    expect(screen.queryByLabelText("Integration token")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use an integration token instead" }));
    expect(screen.getByLabelText("Integration token")).toBeTruthy();
    expect(screen.getByText("Advanced: internal integration token")).toBeTruthy();
  });
});
