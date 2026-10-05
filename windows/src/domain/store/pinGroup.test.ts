import { describe, expect, it } from "vitest";
import { decodePins, encodePin, encodePins, pinIconNone, type Pin } from "./pin";
import {
  addGroup, addPin, deleteGroup, moveGroups, movePinWithinGroup, setPinGroup,
} from "./pinOrdering";

const mk = (id: string, order: number, groupId?: string): Pin => ({
  id, notionId: `n-${id}`, kind: "page", title: id.toUpperCase(), icon: pinIconNone, order,
  ...(groupId === undefined ? {} : { groupId }),
});

describe("Pin groups", () => {
  it("pins.json with no groupId key decodes with groupId == nil", () => {
    const pin = mk("pin-1", 0);
    expect(JSON.stringify(encodePin(pin))).not.toContain("groupId");
    const decoded = decodePins(JSON.parse(JSON.stringify(encodePins([pin]))))[0]!;
    expect(decoded.groupId).toBeUndefined();
    expect(decoded.title).toBe("PIN-1");
  });

  it("move(pinID:toIndex:withinGroup:) reorders only within that group", () => {
    const groupA = "group-a";
    const pins = [mk("a1", 0, groupA), mk("a2", 1, groupA), mk("a3", 2, groupA), mk("b1", 3)];
    const result = movePinWithinGroup(pins, "a3", 0, groupA);
    const groupAOrdered = result.filter((p) => p.groupId === groupA).sort((a, b) => a.order - b.order).map((p) => p.id);
    expect(groupAOrdered).toEqual(["a3", "a1", "a2"]);
    // The ungrouped pin (different group) must be untouched.
    expect(result.find((p) => p.id === "b1")!.order).toBe(3);
  });

  it("deleting a group ungroups its pins instead of deleting them", () => {
    const { groups, group } = addGroup([], "g1", "Work", "\u{1F4BC}");
    const pins = addPin([], { ...mk("p1", 0, group.id), notionId: "n-1" });
    const result = deleteGroup(groups, pins, group.id);
    expect(result.groups).toEqual([]);
    const survivor = result.pins.find((p) => p.notionId === "n-1")!;
    expect(survivor.groupId).toBeUndefined();
    expect("groupId" in survivor).toBe(false);
  });

  it("setGroup moves a pin into a group, appended after its current pins", () => {
    const groupA = "group-a";
    const pins = [mk("a1", 0, groupA), mk("loose", 1)];
    const moved = setPinGroup(pins, "loose", groupA).find((p) => p.id === "loose")!;
    expect(moved.groupId).toBe(groupA);
    expect(moved.order).toBe(1); // appended after a1's order (0)
  });

  it("groups.json round-trips and reorders via moveGroup", () => {
    let { groups } = addGroup([], "g1", "Work", "\u{1F4BC}");
    ({ groups } = addGroup(groups, "g2", "Home", "\u{1F3E0}"));
    expect(groups.map((g) => g.name)).toEqual(["Work", "Home"]);
    const reordered = moveGroups(groups, [1], 0);
    expect(reordered.map((g) => g.name)).toEqual(["Home", "Work"]);
    expect(reordered.map((g) => g.order)).toEqual([0, 1]);
  });

  it("add assigns max order + 1; moveAmongAll renumbers everything", () => {
    const pins = addPin([mk("x", 4)], mk("y", 0));
    expect(pins.find((p) => p.id === "y")!.order).toBe(5);
  });
});
