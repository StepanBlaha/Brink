import { useEffect } from "react";
import { Menu, type MenuEntry } from "../common/Menu";
import type { SnoozeOption } from "../../domain/capture/snooze";

interface Props {
  x: number;
  y: number;
  /** Snooze entries only when the database has a date property. */
  snooze?: { hasTime: boolean; onSnooze: (o: SnoozeOption) => void; onPickDate?: () => void };
  onOpenPage: () => void;
  onOpenInNotion: () => void;
  /** Absent for a read-only database and for Today rows. */
  onRename?: () => void;
  onClose: () => void;
}

/** Right-click menu of a row: Open page, Open in Notion, Rename, and the Snooze submenu. */
export function RowContextMenu({ x, y, snooze, onOpenPage, onOpenInNotion, onRename, onClose }: Props) {
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[role="menu"]')) onClose();
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [onClose]);
  const item = (id: string, label: string, onSelect: () => void, disabled = false): MenuEntry => ({ kind: "item", id, label, onSelect, disabled });
  const items: MenuEntry[] = [item("open", "Open page", onOpenPage), item("notion", "Open in Notion", onOpenInNotion)];
  if (onRename) items.push({ kind: "divider", id: "d1" }, item("rename", "Rename", onRename));
  if (snooze) {
    items.push({
      kind: "submenu", id: "snooze", label: "Snooze",
      items: [
        item("later", "Later today (+3h)", () => snooze.onSnooze("laterToday"), !snooze.hasTime),
        item("tomorrow", "Tomorrow", () => snooze.onSnooze("tomorrow")),
        item("week", "Next week (Monday)", () => snooze.onSnooze("nextWeek")),
        ...(snooze.onPickDate ? [{ kind: "divider", id: "d2" } as const, item("pick", "Pick date…", snooze.onPickDate)] : []),
      ],
    });
  }
  return <Menu x={x} y={y} label="Row menu" items={items} onClose={onClose} />;
}
