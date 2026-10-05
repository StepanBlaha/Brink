import { lucideFor } from "../iconPicker/lucideCatalog";
import type { Pin, PinGroup } from "../../domain/store/pin";

/** Id of the virtual Today pin (M6). It is never stored in pins.json. */
export const TODAY_PIN_ID = "brink.today";
export const isTodayId = (id: string | null | undefined): boolean => id === TODAY_PIN_ID;

/** How a pin's icon is drawn: Notion's emoji, a colored letter, or a placeholder for custom symbols. */
export type PinIconDisplay =
  | { kind: "emoji"; value: string }
  | { kind: "letter"; text: string; colorHex: number }
  | { kind: "symbol"; name: string; colorHex: number };

/** Display model for one strip icon (PinItem.swift). */
export interface PinItem {
  id: string;
  title: string;
  icon: PinIconDisplay;
  isDatabase: boolean;
  isToday: boolean;
  notionId: string;
}

/** The built-in virtual Today pin: not stored, injected first in the strip while `showTodayPin` is on. */
export const TODAY_ITEM: PinItem = {
  id: TODAY_PIN_ID, title: "Today", icon: { kind: "emoji", value: "\u2600\uFE0F" }, isDatabase: false, isToday: true, notionId: "",
};

export interface GroupItem {
  id: string;
  name: string;
  emoji?: string;
}

const firstGrapheme = (s: string): string => {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s.trim())[Symbol.iterator]().next();
  return seg.done ? "" : seg.value.segment;
};

/** A custom icon wins; else Notion's emoji; else the title's first letter (DockController.iconDisplay). */
export function iconDisplayFor(pin: Pin): PinIconDisplay {
  const c = pin.customIcon;
  if (c) {
    switch (c.kind) {
      case "emoji":
        return { kind: "emoji", value: c.value };
      case "letter":
        return { kind: "letter", text: c.value, colorHex: c.colorHex };
      case "sfSymbol":
      case "lucide":
        // Unknown symbol names fall back to the title's first letter (plan 2.6.4).
        return lucideFor(c.name)
          ? { kind: "symbol", name: c.name, colorHex: c.colorHex }
          : { kind: "letter", text: firstGrapheme(pin.title).toUpperCase() || "•", colorHex: c.colorHex };
    }
  }
  if ("emoji" in pin.icon) return { kind: "emoji", value: pin.icon.emoji._0 };
  const first = firstGrapheme(pin.title);
  return { kind: "emoji", value: first === "" ? "•" : first.toUpperCase() };
}

export function pinItemFor(pin: Pin): PinItem {
  return {
    id: pin.id,
    title: pin.title,
    icon: iconDisplayFor(pin),
    isDatabase: pin.kind === "dataSource",
    isToday: false,
    notionId: pin.notionId,
  };
}

/** The active group when it still exists; otherwise `undefined` (= All pins). */
export function effectiveGroupId(groups: PinGroup[], activeGroupID: string | undefined): string | undefined {
  return activeGroupID !== undefined && groups.some((g) => g.id === activeGroupID) ? activeGroupID : undefined;
}

/** Pins of the active group, or all pins (DockController.activePins). */
export function activePins(pins: Pin[], groups: PinGroup[], activeGroupID: string | undefined): Pin[] {
  const id = effectiveGroupId(groups, activeGroupID);
  return id === undefined ? pins : pins.filter((p) => p.groupId === id);
}

export function groupItems(groups: PinGroup[]): GroupItem[] {
  return groups.map((g) => (g.emoji === undefined ? { id: g.id, name: g.name } : { id: g.id, name: g.name, emoji: g.emoji }));
}

export function groupLabel(g: GroupItem): string {
  return g.emoji ? `${g.emoji} ${g.name}` : g.name;
}

/** The strip: the virtual Today pin first (when shown), then the active pins. */
export function stripItems(pins: Pin[], showToday: boolean, todayItem?: PinItem): PinItem[] {
  const items = pins.map(pinItemFor);
  return showToday && todayItem ? [todayItem, ...items] : items;
}

/** What a drop means for the stores. `null` = rejected (Today, or no move). */
export interface ReorderIntent {
  pinId: string;
  toIndex: number;
  /** Active group id, or `undefined` to reorder among all pins. */
  groupId: string | undefined;
}

/**
 * Today is not stored, so strip indices shift by one while it is shown (onReorder in DockController).
 * Dragging Today is rejected; dropping onto Today's slot clamps to the first real position.
 */
export function reorderIntent(
  item: PinItem,
  stripIndex: number,
  showToday: boolean,
  groupId: string | undefined,
): ReorderIntent | null {
  if (item.isToday || isTodayId(item.id)) return null;
  const toIndex = Math.max(0, stripIndex - (showToday ? 1 : 0));
  return { pinId: item.id, toIndex, groupId };
}

/** Index the dragged icon lands on: translation in stride units, clamped (ReorderableStrip). */
export function dragTargetIndex(original: number, translation: number, stride: number, count: number): number {
  const shift = Math.round(translation / stride);
  return Math.max(0, Math.min(count - 1, original + shift));
}

/** Offset of a non-dragged icon while another one is dragged from `original` to `target`. */
export function shiftOffset(index: number, original: number, target: number, stride: number): number {
  if (target > original && index > original && index <= target) return -stride;
  if (target < original && index >= target && index < original) return stride;
  return 0;
}
