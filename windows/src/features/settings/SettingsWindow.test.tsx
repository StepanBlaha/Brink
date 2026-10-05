import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../state/bridge", () => ({ initState: vi.fn().mockResolvedValue(() => undefined) }));
const handlers = vi.hoisted(() => new Map<string, (p: unknown) => void>());
vi.mock("../../ipc/events", () => ({
  on: vi.fn(async (name: string, h: (p: unknown) => void) => {
    handlers.set(name, h);
    return () => undefined;
  }),
}));
vi.mock("./AppearanceSection", () => ({ AppearanceSection: () => <p>appearance body</p> }));
vi.mock("./ConnectionSection", () => ({ ConnectionSection: () => <p>connection body</p> }));
vi.mock("./GeneralSection", () => ({ GeneralSection: () => <p>general body</p> }));
vi.mock("./GroupsSection", () => ({ GroupsSection: () => <p>groups body</p> }));
vi.mock("./ShortcutsSection", () => ({ ShortcutsSection: () => <p>shortcuts body</p> }));

import { SECTIONS, SettingsWindow } from "./SettingsWindow";

afterEach(cleanup);

describe("SettingsWindow", () => {
  it("has the five sections in the Mac order, starting on Connection", async () => {
    render(<SettingsWindow />);
    await act(async () => undefined);
    expect(SECTIONS.map((s) => s.label)).toEqual(["Connection", "Appearance", "General", "Groups", "Shortcuts"]);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Connection", "Appearance", "General", "Groups", "Shortcuts"]);
    expect(screen.getByText("connection body")).toBeTruthy();
  });

  it("clicking a tab switches the body", async () => {
    render(<SettingsWindow />);
    await act(async () => undefined);
    fireEvent.click(screen.getByRole("tab", { name: "General" }));
    expect(screen.getByText("general body")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens on the section from the route and follows settings://section", async () => {
    render(<SettingsWindow initial="groups" />);
    await act(async () => undefined);
    expect(screen.getByText("groups body")).toBeTruthy();
    act(() => handlers.get("settings://section")?.("shortcuts"));
    expect(screen.getByText("shortcuts body")).toBeTruthy();
    act(() => handlers.get("settings://section")?.("nonsense"));
    expect(screen.getByText("shortcuts body")).toBeTruthy();
  });

  it("an unknown route section falls back to Connection; arrow keys move between tabs", async () => {
    render(<SettingsWindow initial="bogus" />);
    await act(async () => undefined);
    expect(screen.getByText("connection body")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Connection" }), { key: "ArrowDown" });
    expect(screen.getByText("appearance body")).toBeTruthy();
  });
});
