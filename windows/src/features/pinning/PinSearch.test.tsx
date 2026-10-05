import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/commands", () => ({ notionSearch: search }));

import { EMPTY_COPY, PinSearch } from "./PinSearch";

const r = (id: string, title: string, kind: "page" | "dataSource" = "page") => ({ id, kind, title, icon: { type: "none" as const } });
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("PinSearch", () => {
  it("moves with arrows, picks with Enter, shows Untitled, kind label and the pinned check", async () => {
    search.mockResolvedValue([r("a", "Alpha"), r("b", "", "dataSource"), r("c", "Gamma")]);
    const onPick = vi.fn();
    render(<PinSearch pinnedIds={new Set(["a"])} onPick={onPick} onClose={() => undefined} />);
    await flush();
    expect(screen.getByText("Untitled")).toBeTruthy();
    expect(screen.getByText("Database")).toBeTruthy();
    expect(screen.getByLabelText("Pinned")).toBeTruthy();
    const input = screen.getByLabelText("Search Notion");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
  });

  it("shows the share hint when nothing is found", async () => {
    search.mockResolvedValue([]);
    render(<PinSearch pinnedIds={new Set()} onPick={() => undefined} onClose={() => undefined} />);
    await flush();
    expect(screen.getByText(EMPTY_COPY)).toBeTruthy();
  });

  it("shows the error", async () => {
    search.mockRejectedValue({ message: "Token rejected." });
    render(<PinSearch pinnedIds={new Set()} onPick={() => undefined} onClose={() => undefined} />);
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Token rejected.");
  });
});
