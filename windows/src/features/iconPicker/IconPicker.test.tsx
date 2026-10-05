import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cmd = vi.hoisted(() => ({ pinsUpdate: vi.fn(), pinsGet: vi.fn(), notionSetPageEmojiIcon: vi.fn() }));
vi.mock("../../ipc/commands", () => cmd);
const panel = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../ipc/windowsIpc", () => ({ emojiPanelOpen: panel }));

import type { Pin } from "../../domain/store/pin";
import { usePinsStore } from "../../state/pinsStore";
import { IconPicker } from "./IconPicker";

const page: Pin = { id: "p1", notionId: "n1", kind: "page", title: "Groceries", icon: { none: {} }, order: 0 };
const db: Pin = { id: "p2", notionId: "n2", kind: "dataSource", title: "Tasks", icon: { none: {} }, order: 1 };
const saved = () => cmd.pinsUpdate.mock.calls.at(-1)?.[0] as Pin;

beforeEach(() => {
  cmd.pinsUpdate.mockReset().mockResolvedValue(undefined);
  cmd.notionSetPageEmojiIcon.mockReset().mockResolvedValue(undefined);
  panel.mockClear();
  usePinsStore.setState({ pins: [page, db], hydrated: true });
});
afterEach(cleanup);

describe("IconPicker", () => {
  it("emoji: search by keyword, pick saves a custom emoji icon", async () => {
    render(<IconPicker pinId="p1" onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Search emoji"), { target: { value: "rocket" } });
    const hit = screen.getAllByRole("button").find((b) => b.textContent === "🚀");
    expect(hit).toBeTruthy();
    fireEvent.click(hit as HTMLElement);
    await act(async () => undefined);
    expect(saved().customIcon).toEqual({ kind: "emoji", value: "🚀" });
    expect(cmd.notionSetPageEmojiIcon).not.toHaveBeenCalled();
  });

  it("lays emoji out in 8 columns and shows a message when nothing matches", () => {
    render(<IconPicker pinId="p1" onClose={() => undefined} />);
    const grid = screen.getByRole("region", { name: "Smileys" }).querySelector("div") as HTMLElement;
    expect(grid.className).toMatch(/emojis/);
    fireEvent.change(screen.getByLabelText("Search emoji"), { target: { value: "zzzz" } });
    expect(screen.getByText("No emoji found.")).toBeTruthy();
  });

  it("'Also set as page icon in Notion' is offered for pages only and calls Notion", async () => {
    const { unmount } = render(<IconPicker pinId="p1" onClose={() => undefined} />);
    fireEvent.click(screen.getByLabelText("Also set as page icon in Notion"));
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent === "😀") as HTMLElement);
    await act(async () => undefined);
    expect(cmd.notionSetPageEmojiIcon).toHaveBeenCalledWith("n1", "😀");
    unmount();
    render(<IconPicker pinId="p2" onClose={() => undefined} />);
    expect(screen.queryByLabelText("Also set as page icon in Notion")).toBeNull();
  });

  it("shows the Notion error and keeps the local icon", async () => {
    cmd.notionSetPageEmojiIcon.mockRejectedValue({ kind: "forbidden", message: "Share the page with your integration." });
    render(<IconPicker pinId="p1" onClose={() => undefined} />);
    fireEvent.click(screen.getByLabelText("Also set as page icon in Notion"));
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent === "😀") as HTMLElement);
    await act(async () => undefined);
    expect(screen.getByRole("alert").textContent).toBe("Share the page with your integration.");
    expect(saved().customIcon).toEqual({ kind: "emoji", value: "😀" });
  });

  it("'Open emoji panel' asks Windows for Win+. and a character typed into the capture field is used", async () => {
    render(<IconPicker pinId="p1" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Open emoji panel" }));
    expect(panel).toHaveBeenCalled();
    const capture = document.querySelector("input[aria-hidden]") as HTMLInputElement;
    expect(document.activeElement).toBe(capture);
    fireEvent.change(capture, { target: { value: "🧠" } });
    await act(async () => undefined);
    expect(saved().customIcon).toEqual({ kind: "emoji", value: "🧠" });
    expect(capture.value).toBe("");
  });

  it("symbol: 6 columns of Lucide icons tinted with the chosen swatch", async () => {
    render(<IconPicker pinId="p1" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "Symbol" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pink" }));
    fireEvent.click(screen.getByRole("button", { name: "star" }));
    await act(async () => undefined);
    expect(saved().customIcon).toEqual({ kind: "lucide", name: "star", colorHex: 0xff375f });
  });

  it("letter: uppercased, two letters at most, falls back to the title", async () => {
    render(<IconPicker pinId="p1" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: "Letter" }));
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    await act(async () => undefined);
    expect(saved().customIcon).toEqual({ kind: "letter", value: "G", colorHex: 0x0a84ff });
    fireEvent.change(screen.getByLabelText("Letters"), { target: { value: "xyz" } });
    expect((screen.getByLabelText("Letters") as HTMLInputElement).value).toBe("XY");
    fireEvent.click(screen.getByRole("radio", { name: "Green" }));
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    await act(async () => undefined);
    expect(saved().customIcon).toEqual({ kind: "letter", value: "XY", colorHex: 0x32d74b });
  });

  it("Reset to Notion icon clears the override and is disabled without one", async () => {
    render(<IconPicker pinId="p1" onClose={() => undefined} />);
    const reset = screen.getByRole("button", { name: "Reset to Notion icon" });
    expect(reset.hasAttribute("disabled")).toBe(true);
    act(() => usePinsStore.setState({ pins: [{ ...page, customIcon: { kind: "emoji", value: "🚀" } }, db] }));
    expect(reset.hasAttribute("disabled")).toBe(false);
    fireEvent.click(reset);
    await act(async () => undefined);
    expect("customIcon" in saved()).toBe(false);
  });

  it("the close button calls onClose", () => {
    const onClose = vi.fn();
    render(<IconPicker pinId="p1" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
