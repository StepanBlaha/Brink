import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Block } from "../../domain/notion/block";
import { span } from "../../domain/notion/richText";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Pin } from "../../domain/store/pin";
import { TrayFlyout } from "./TrayFlyout";
import type { MiniPorts } from "./miniListModel";

vi.mock("../../ipc/captureIpc", () => ({ trayFlyoutHide: vi.fn(async () => {}) }));
vi.mock("../../ipc/commands", () => ({ showSettings: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn(async () => {}) }));

const pin: Pin = { id: "a", notionId: "n-a", kind: "page", title: "Inbox", icon: { emoji: { _0: "📥" } }, order: 0 };
const todo = (id: string, t: string): Block => ({ id, type: { kind: "toDo", checked: false }, hasChildren: false, richText: [span(t)] });

function ports(pins: Pin[], ops: Operation[] = [], token = true): MiniPorts {
  return {
    pins: () => pins, groups: () => [], activeGroupId: () => undefined, lastOpenedPinId: () => undefined,
    summaries: () => ({}), hasToken: () => token, cachedBlocks: async () => null,
    pageBlocks: async () => [todo("t1", "Milk"), todo("t2", "Bread")],
    databaseModel: () => null, submit: async (op) => { ops.push(op); return { kind: "saved" }; },
    tick: () => {}, contentChanged: () => {},
  };
}

describe("TrayFlyout", () => {
  it("empty states", () => {
    const { unmount } = render(<TrayFlyout ports={ports([])} />);
    expect(screen.getByText("No pins yet.")).toBeTruthy();
    unmount();
    render(<TrayFlyout ports={ports([], [], false)} />);
    expect(screen.getByText("Connect Notion in Settings.")).toBeTruthy();
  });

  it("expands lazily, ticks an item and quick adds to the target", async () => {
    const ops: Operation[] = [];
    render(<TrayFlyout ports={ports([pin], ops)} />);
    expect(screen.getByPlaceholderText("Add to Inbox…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Inbox/ }));
    await waitFor(() => screen.getByText("Milk"));
    fireEvent.click(screen.getByLabelText("Complete Milk"));
    await waitFor(() => expect(ops[0]).toMatchObject({ kind: "updateBlock", blockId: "t1" }));
    const input = screen.getByPlaceholderText("Add to Inbox…");
    fireEvent.change(input, { target: { value: "Call mom" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(ops.some((o) => o.kind === "appendBlock")).toBe(true));
  });
});
