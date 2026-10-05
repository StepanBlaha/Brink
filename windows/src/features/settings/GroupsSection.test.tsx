import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cmd = vi.hoisted(() => ({
  groupsGet: vi.fn(), groupsAdd: vi.fn(), groupsRename: vi.fn(), groupsDelete: vi.fn(), groupsMove: vi.fn(), pinsGet: vi.fn(),
}));
vi.mock("../../ipc/commands", () => cmd);

import type { Pin, PinGroup } from "../../domain/store/pin";
import { useGroupsStore } from "../../state/groupsStore";
import { usePinsStore } from "../../state/pinsStore";
import { GroupsSection } from "./GroupsSection";

const groups: PinGroup[] = [
  { id: "g1", name: "Work", emoji: "💼", order: 0 },
  { id: "g2", name: "Home", order: 1 },
];
const pin = (id: string, groupId?: string): Pin => ({ id, notionId: id, kind: "page", title: id, icon: { none: {} }, order: 0, ...(groupId ? { groupId } : {}) });

beforeEach(() => {
  for (const f of Object.values(cmd)) f.mockReset().mockResolvedValue(undefined);
  cmd.groupsGet.mockResolvedValue(groups);
  cmd.pinsGet.mockResolvedValue([]);
  useGroupsStore.setState({ groups, hydrated: true });
  usePinsStore.setState({ pins: [pin("a", "g1"), pin("b", "g1"), pin("c", "g2"), pin("d")], hydrated: true });
});
afterEach(cleanup);

const renderIt = async () => {
  render(<GroupsSection />);
  await act(async () => undefined);
};

describe("GroupsSection", () => {
  it("lists groups with emoji, name and pin counts", async () => {
    await renderIt();
    expect((screen.getByLabelText("Name of Work") as HTMLInputElement).value).toBe("Work");
    expect((screen.getByLabelText("Emoji for Work") as HTMLInputElement).value).toBe("💼");
    expect(screen.getByText("2 pins")).toBeTruthy();
    expect(screen.getByText("1 pin")).toBeTruthy();
  });

  it("renames on blur only when something changed", async () => {
    await renderIt();
    const name = screen.getByLabelText("Name of Work");
    fireEvent.blur(name);
    expect(cmd.groupsRename).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: "Office" } });
    fireEvent.blur(name);
    expect(cmd.groupsRename).toHaveBeenCalledWith("g1", "Office", "💼");
  });

  it("moves by one place and disables the ends", async () => {
    await renderIt();
    expect(screen.getByLabelText("Move Work up").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Move Home down").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("Move Work down"));
    expect(cmd.groupsMove).toHaveBeenCalledWith([0], 2);
  });

  it("moving up sends the previous slot", async () => {
    await renderIt();
    fireEvent.click(screen.getByLabelText("Move Home up"));
    expect(cmd.groupsMove).toHaveBeenCalledWith([1], 0);
  });

  it("deleting ungroups its pins instead of removing them", async () => {
    await renderIt();
    fireEvent.click(screen.getByLabelText("Delete Work"));
    expect(cmd.groupsDelete).toHaveBeenCalledWith("g1");
    expect(usePinsStore.getState().pins.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(usePinsStore.getState().pins.find((p) => p.id === "a")?.groupId).toBeUndefined();
  });

  it("adds a group with an optional emoji", async () => {
    await renderIt();
    const add = screen.getByRole("button", { name: "Add" });
    expect(add.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("New group name"), { target: { value: "  Study " } });
    fireEvent.change(screen.getByLabelText("New group emoji"), { target: { value: "📚 extra" } });
    fireEvent.click(add);
    expect(cmd.groupsAdd).toHaveBeenCalledWith("Study", "📚");
  });
});
