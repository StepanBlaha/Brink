import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ipc/commands", () => ({ appVersion: vi.fn().mockResolvedValue({ marketing: "0.10.0", build: "2" }) }));
const openUrl = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../ipc/captureIpc", () => ({ openUrl }));
const windowOpen = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../ipc/windowsIpc", () => ({ windowOpen }));

import { AboutWindow, NON_AFFILIATION, TAGLINE } from "./AboutWindow";
import { LegalWindow } from "./LegalWindow";

beforeEach(() => {
  openUrl.mockClear();
  windowOpen.mockClear();
});
afterEach(cleanup);

describe("AboutWindow", () => {
  it("shows the icon, name, tagline, version, copyright and the non-affiliation line", async () => {
    render(<AboutWindow />);
    await act(async () => undefined);
    expect(screen.getByRole("img", { name: "Brink app icon" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Brink" })).toBeTruthy();
    expect(screen.getByText(TAGLINE).textContent).toBe("Your pages, on the edge.");
    expect(screen.getByText("Version 0.10.0 (2)")).toBeTruthy();
    expect(screen.getByText("© 2026 Stepan Blaha")).toBeTruthy();
    expect(screen.getByText(NON_AFFILIATION)).toBeTruthy();
  });

  it("links to the website and opens the legal windows", async () => {
    render(<AboutWindow />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("button", { name: "Website" }));
    expect(openUrl).toHaveBeenCalledWith("https://brinknotch.site/");
    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    fireEvent.click(screen.getByRole("button", { name: "Acknowledgements" }));
    expect(windowOpen.mock.calls.map((c) => c[0])).toEqual(["legal:privacy", "legal:terms", "legal:notice"]);
  });
});

describe("LegalWindow", () => {
  it("renders the bundled privacy policy with its headings and table rows", () => {
    render(<LegalWindow doc="privacy" />);
    expect(screen.getByRole("heading", { name: "Brink Privacy Policy" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What Brink stores" })).toBeTruthy();
    expect(document.body.textContent).toContain("Your Notion credential");
  });

  it("renders the terms and the acknowledgements, and opens links through the allow-list", () => {
    render(<LegalWindow doc="notice" />);
    expect(screen.getByRole("heading", { name: "Third-Party Notices" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Notion API" }));
    expect(openUrl).toHaveBeenCalledWith("https://developers.notion.com");
    cleanup();
    render(<LegalWindow doc="terms" />);
    expect(screen.getByRole("heading", { name: "Brink Terms of Use" })).toBeTruthy();
  });
});
