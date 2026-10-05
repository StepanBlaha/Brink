import type { Pin, PinGroup } from "./pin";
import { sortByOrder } from "./pin";

/** SwiftUI `IndexSet` move: `fromOffsets` are removed and inserted at `toOffset` (pre-removal index). */
export function moveItems<T extends { order: number }>(items: T[], fromOffsets: number[], toOffset: number): T[] {
  const moving = fromOffsets.map((i) => items[i]).filter((x): x is T => x !== undefined);
  const remaining = items.filter((_, i) => !fromOffsets.includes(i));
  const insertionIndex = fromOffsets.filter((i) => i < toOffset).length;
  const adjusted = toOffset - insertionIndex;
  remaining.splice(Math.min(adjusted, remaining.length), 0, ...moving);
  return remaining.map((item, index) => ({ ...item, order: index }));
}

function withoutKey<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> {
  const copy = { ...o };
  delete copy[key];
  return copy;
}

function maxOrder(items: { order: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.order), -1);
}

export function addPin(pins: Pin[], pin: Pin): Pin[] {
  return [...pins, { ...pin, order: maxOrder(pins) + 1 }];
}

export function removePin(pins: Pin[], id: string): Pin[] {
  return pins.filter((p) => p.id !== id);
}

export function movePins(pins: Pin[], fromOffsets: number[], toOffset: number): Pin[] {
  return moveItems(pins, fromOffsets, toOffset);
}

function reorder(pins: Pin[], pinId: string, toIndex: number, scope: Pin[]): Pin[] {
  const scopePins = sortByOrder(scope);
  const from = scopePins.findIndex((p) => p.id === pinId);
  if (from < 0) return pins;
  const [moving] = scopePins.splice(from, 1);
  scopePins.splice(Math.min(Math.max(toIndex, 0), scopePins.length), 0, moving as Pin);
  const orders = new Map(scopePins.map((p, offset) => [p.id, offset]));
  // Orders may collide across groups; kept on purpose (PinStore.reorder).
  return pins.map((p) => (orders.has(p.id) ? { ...p, order: orders.get(p.id) as number } : p)).sort((a, b) => a.order - b.order);
}

/** Reorders within the pins sharing `groupId` (`undefined` = ungrouped). */
export function movePinWithinGroup(pins: Pin[], pinId: string, toIndex: number, groupId: string | undefined): Pin[] {
  return reorder(pins, pinId, toIndex, pins.filter((p) => p.groupId === groupId));
}

export function movePinAmongAll(pins: Pin[], pinId: string, toIndex: number): Pin[] {
  return reorder(pins, pinId, toIndex, pins);
}

export function updatePin(pins: Pin[], pin: Pin): Pin[] {
  return pins.map((p) => (p.id === pin.id ? pin : p));
}

/** Moves into `groupId` (`undefined` = ungrouped), appended after that group's current pins. */
export function setPinGroup(pins: Pin[], pinId: string, groupId: string | undefined): Pin[] {
  if (!pins.some((p) => p.id === pinId)) return pins;
  const max = maxOrder(pins.filter((p) => p.groupId === groupId && p.id !== pinId));
  return pins.map((p) => {
    if (p.id !== pinId) return p;
    const next = withoutKey(p, "groupId");
    return groupId === undefined ? { ...next, order: max + 1 } : { ...next, groupId, order: max + 1 };
  });
}

export function addGroup(groups: PinGroup[], id: string, name: string, emoji?: string): { groups: PinGroup[]; group: PinGroup } {
  const group: PinGroup = emoji === undefined ? { id, name, order: maxOrder(groups) + 1 } : { id, name, emoji, order: maxOrder(groups) + 1 };
  return { groups: [...groups, group], group };
}

export function renameGroup(groups: PinGroup[], id: string, name: string, emoji?: string): PinGroup[] {
  return groups.map((g) => {
    if (g.id !== id) return g;
    const next = withoutKey(g, "emoji");
    return emoji === undefined ? { ...next, name } : { ...next, name, emoji };
  });
}

/** Ungroups the group's pins; never deletes pins. */
export function deleteGroup(groups: PinGroup[], pins: Pin[], id: string): { groups: PinGroup[]; pins: Pin[] } {
  return {
    groups: groups.filter((g) => g.id !== id),
    pins: pins.map((p) => {
      return p.groupId === id ? withoutKey(p, "groupId") : p;
    }),
  };
}

export function moveGroups(groups: PinGroup[], fromOffsets: number[], toOffset: number): PinGroup[] {
  return moveItems(groups, fromOffsets, toOffset);
}
