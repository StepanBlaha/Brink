import { useState } from "react";
import { openInNotion } from "../../ipc/commands";
import { windowOpen } from "../../ipc/windowsIpc";
import { ignore } from "../../state/ignore";
import { useGroupsStore } from "../../state/groupsStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { Menu, type MenuEntry } from "../common/Menu";
import { Popover } from "../common/Popover";
import type { NotchEdge, Rect } from "../notch/notchGeometry";
import { groupItems, groupLabel, isTodayId } from "./pinItems";
import styles from "./strip.module.css";

/** What is open over the strip: a pin's context menu, the group switcher, or the new-group prompt. */
export type Overlay =
  | { kind: "pin"; pinId: string; x: number; y: number }
  | { kind: "groups"; x: number; y: number }
  | { kind: "newGroup"; x: number; y: number };

interface Props {
  overlay: Overlay;
  edge: NotchEdge;
  /** The panel is open on this pin with Keep open on. */
  keptOpenPinId: string | null;
  onKeepOpen: (pinId: string) => void;
  onEditView: (pinId: string) => void;
  onChangeIcon: (pinId: string) => void;
  /** A pin was removed: collapse when it was the open one. */
  onUnpinned: (pinId: string) => void;
  onRect: (r: Rect | null) => void;
  onClose: () => void;
}

/** Where menus grow from: away from the screen edge the notch sits on. */
export const alignFor = (edge: NotchEdge): "start" | "end" => (edge === "right" ? "end" : "start");

function NewGroupPrompt(p: { x: number; y: number; align: "start" | "end"; onRect: Props["onRect"]; onClose: () => void }) {
  const [name, setName] = useState("");
  const create = () => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    const add = useGroupsStore.getState().add;
    const before = new Set(useGroupsStore.getState().groups.map((g) => g.id));
    ignore(
      add(trimmed).then(() => {
        const made = useGroupsStore.getState().groups.find((g) => !before.has(g.id));
        if (made) return useSettingsStore.getState().update({ activeGroupID: made.id });
      }),
    );
    p.onClose();
  };
  return (
    <Popover x={p.x} y={p.y} align={p.align} label="New group" onRect={p.onRect}>
      <form className={styles.prompt} onSubmit={(e) => { e.preventDefault(); create(); }}>
        <label className={styles.promptLabel} htmlFor="new-group-name">New group</label>
        <input
          id="new-group-name"
          autoFocus
          className={styles.promptInput}
          placeholder="Name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && p.onClose()}
        />
      </form>
    </Popover>
  );
}

export function StripOverlay({ overlay, edge, keptOpenPinId, onKeepOpen, onEditView, onChangeIcon, onUnpinned, onRect, onClose }: Props) {
  const pins = usePinsStore((s) => s.pins);
  const groups = useGroupsStore((s) => s.groups);
  const activeGroupID = useSettingsStore((s) => s.settings.activeGroupID);
  const align = alignFor(edge);
  const pos = { x: overlay.x, y: overlay.y, align, onRect, onClose };

  if (overlay.kind === "newGroup") return <NewGroupPrompt {...pos} />;

  if (overlay.kind === "groups") {
    const setActive = (id: string) => ignore(useSettingsStore.getState().update({ activeGroupID: id }));
    const items: MenuEntry[] = [
      { kind: "item", id: "all", label: "All pins", checked: !activeGroupID, onSelect: () => setActive("") },
      ...groupItems(groups).map((g): MenuEntry => ({
        kind: "item", id: `group-${g.id}`, label: groupLabel(g), checked: activeGroupID === g.id, onSelect: () => setActive(g.id),
      })),
      { kind: "divider", id: "d" },
      { kind: "item", id: "new", label: "New group…", onSelect: () => {} },
      { kind: "item", id: "manage", label: "Manage…", onSelect: () => ignore(windowOpen("settings", "groups")) },
    ];
    return <GroupsMenu {...pos} items={items} />;
  }

  if (isTodayId(overlay.pinId)) {
    const hide: MenuEntry[] = [
      { kind: "item", id: "hide", label: "Hide Today", onSelect: () => {
        ignore(useSettingsStore.getState().update({ showTodayPin: false }));
        onUnpinned(overlay.pinId);
      } },
    ];
    return <Menu {...pos} label="Today menu" items={hide} />;
  }
  const pin = pins.find((p) => p.id === overlay.pinId);
  if (!pin) return null;
  const items: MenuEntry[] = [
    { kind: "item", id: "keep", label: keptOpenPinId === pin.id ? "Keep open ✓" : "Keep open", onSelect: () => onKeepOpen(pin.id) },
    { kind: "item", id: "icon", label: "Change Icon…", onSelect: () => onChangeIcon(pin.id) },
    ...(pin.kind === "dataSource" ? [{ kind: "item", id: "edit", label: "Edit View…", onSelect: () => onEditView(pin.id) } as MenuEntry] : []),
    ...(groups.length > 0
      ? [{
          kind: "submenu", id: "move", label: "Move to group",
          items: [
            { kind: "item", id: "m-none", label: "Ungrouped", checked: pin.groupId === undefined, onSelect: () => ignore(usePinsStore.getState().setGroup(pin.id, undefined)) },
            { kind: "divider", id: "m-d" },
            ...groupItems(groups).map((g): MenuEntry => ({
              kind: "item", id: `m-${g.id}`, label: groupLabel(g), checked: pin.groupId === g.id,
              onSelect: () => ignore(usePinsStore.getState().setGroup(pin.id, g.id)),
            })),
          ],
        } as MenuEntry]
      : []),
    { kind: "item", id: "open", label: "Open in Notion", onSelect: () => ignore(openInNotion(pin.notionId)) },
    {
      kind: "item", id: "unpin", label: "Unpin",
      onSelect: () => {
        ignore(usePinsStore.getState().remove(pin.id));
        onUnpinned(pin.id);
      },
    },
  ];
  return <Menu {...pos} label={`${pin.title} menu`} items={items} />;
}

function GroupsMenu(p: { x: number; y: number; align: "start" | "end"; items: MenuEntry[]; onRect: Props["onRect"]; onClose: () => void }) {
  const [prompt, setPrompt] = useState(false);
  if (prompt) return <NewGroupPrompt {...p} />;
  const items = p.items.map((i) => (i.kind === "item" && i.id === "new" ? { ...i, onSelect: () => setPrompt(true), keepOpen: true } : i));
  return <Menu {...p} label="Groups" items={items} />;
}
