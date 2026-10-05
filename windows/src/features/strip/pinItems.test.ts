import { describe, expect, it } from "vitest";
import type { Pin, PinGroup } from "../../domain/store/pin";
import {
  activePins, dragTargetIndex, groupLabel, iconDisplayFor, pinItemFor, reorderIntent, shiftOffset, stripItems,
  TODAY_PIN_ID, type PinItem,
} from "./pinItems";

const pin = (id: string, extra: Partial<Pin> = {}): Pin => ({
  id, notionId: `n-${id}`, kind: "page", title: `Title ${id}`, icon: { none: {} }, order: 0, ...extra,
});
const groups: PinGroup[] = [{ id: "g1", name: "Work", order: 0, emoji: "💼" }];
const today: PinItem = {
  id: TODAY_PIN_ID, title: "Today", icon: { kind: "emoji", value: "☀️" }, isDatabase: false, isToday: true, notionId: "",
};

describe("icons", () => {
  it("uses the emoji, a custom icon, or the title's first letter", () => {
    expect(iconDisplayFor(pin("a", { icon: { emoji: { _0: "🚀" } } }))).toEqual({ kind: "emoji", value: "🚀" });
    expect(iconDisplayFor(pin("a", { title: "  éclair" }))).toEqual({ kind: "emoji", value: "É" });
    expect(iconDisplayFor(pin("a", { title: " " }))).toEqual({ kind: "emoji", value: "•" });
    expect(iconDisplayFor(pin("a", { icon: { emoji: { _0: "🚀" } }, customIcon: { kind: "letter", value: "Q", colorHex: 255 } }))).toEqual({
      kind: "letter", text: "Q", colorHex: 255,
    });
  });
  it("marks database pins", () => {
    expect(pinItemFor(pin("d", { kind: "dataSource" })).isDatabase).toBe(true);
  });
});

describe("groups", () => {
  const pins = [pin("a", { groupId: "g1" }), pin("b"), pin("c", { groupId: "g1" })];
  it("filters by the active group and ignores a missing group", () => {
    expect(activePins(pins, groups, "g1").map((p) => p.id)).toEqual(["a", "c"]);
    expect(activePins(pins, groups, "gone").map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(activePins(pins, groups, undefined)).toHaveLength(3);
  });
  it("labels with the emoji", () => {
    expect(groupLabel({ id: "g", name: "Work", emoji: "💼" })).toBe("💼 Work");
    expect(groupLabel({ id: "g", name: "Work" })).toBe("Work");
  });
});

describe("strip and reorder", () => {
  it("puts Today first when shown", () => {
    expect(stripItems([pin("a")], true, today).map((i) => i.id)).toEqual([TODAY_PIN_ID, "a"]);
    expect(stripItems([pin("a")], false, today).map((i) => i.id)).toEqual(["a"]);
  });
  it("rejects dragging Today and shifts indices around it", () => {
    expect(reorderIntent(today, 2, true, undefined)).toBeNull();
    const a = pinItemFor(pin("a"));
    expect(reorderIntent(a, 3, true, "g1")).toEqual({ pinId: "a", toIndex: 2, groupId: "g1" });
    expect(reorderIntent(a, 0, true, undefined)?.toIndex).toBe(0);
    expect(reorderIntent(a, 2, false, undefined)?.toIndex).toBe(2);
  });
  it("computes drag targets like ReorderableStrip", () => {
    expect(dragTargetIndex(1, 40, 36, 5)).toBe(2);
    expect(dragTargetIndex(1, 17, 36, 5)).toBe(1);
    expect(dragTargetIndex(1, -400, 36, 5)).toBe(0);
    expect(dragTargetIndex(3, 400, 36, 5)).toBe(4);
  });
  it("shifts the icons between original and target out of the way", () => {
    expect([0, 1, 2, 3].map((i) => shiftOffset(i, 0, 2, 36))).toEqual([0, -36, -36, 0]);
    expect([0, 1, 2, 3].map((i) => shiftOffset(i, 3, 1, 36))).toEqual([0, 36, 36, 0]);
  });
});
