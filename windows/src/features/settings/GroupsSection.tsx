import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { PinGroup } from "../../domain/store/pin";
import { useGroupsStore } from "../../state/groupsStore";
import { usePinsStore } from "../../state/pinsStore";
import { Button, Hint, PageTitle } from "./controls";
import styles from "./groups.module.css";

const firstGrapheme = (s: string): string => {
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s.trim())[Symbol.iterator]().next();
  return seg.done ? "" : seg.value.segment;
};

interface RowProps {
  group: PinGroup;
  count: number;
  first: boolean;
  last: boolean;
  index: number;
}

/** Name and emoji commit on blur or Enter (the Mac saves per keystroke; Rust writes a file per change here). */
function GroupRow({ group, count, first, last, index }: RowProps) {
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji ?? "");
  const store = useGroupsStore.getState;
  const commit = () => {
    const n = name.trim() === "" ? group.name : name.trim();
    const e = firstGrapheme(emoji);
    setName(n);
    setEmoji(e);
    if (n !== group.name || e !== (group.emoji ?? "")) void store().rename(group.id, n, e === "" ? undefined : e);
  };
  const onKey = (ev: React.KeyboardEvent) => ev.key === "Enter" && (ev.target as HTMLElement).blur();
  return (
    <li className={styles.row}>
      <input className={`${styles.field} ${styles.emoji}`} aria-label={`Emoji for ${group.name}`} value={emoji} onChange={(e) => setEmoji(e.target.value)} onBlur={commit} onKeyDown={onKey} />
      <input className={`${styles.field} ${styles.name}`} aria-label={`Name of ${group.name}`} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={onKey} />
      <span className={styles.count}>{`${count} pin${count === 1 ? "" : "s"}`}</span>
      <button type="button" className={styles.icon} aria-label={`Move ${group.name} up`} disabled={first} onClick={() => void store().move([index], index - 1)}><ArrowUp size={14} /></button>
      <button type="button" className={styles.icon} aria-label={`Move ${group.name} down`} disabled={last} onClick={() => void store().move([index], index + 2)}><ArrowDown size={14} /></button>
      <button type="button" className={`${styles.icon} ${styles.del}`} aria-label={`Delete ${group.name}`} onClick={() => void store().remove(group.id)}><Trash2 size={14} /></button>
    </li>
  );
}

/** Settings, Groups: rename, reorder, delete (ungroups) and add. */
export function GroupsSection() {
  const groups = useGroupsStore((s) => s.groups);
  const pins = usePinsStore((s) => s.pins);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const ordered = [...groups].sort((a, b) => a.order - b.order);
  const add = () => {
    const n = name.trim();
    if (n === "") return;
    const e = firstGrapheme(emoji);
    void useGroupsStore.getState().add(n, e === "" ? undefined : e);
    setName("");
    setEmoji("");
  };
  return (
    <div className={styles.page}>
      <PageTitle>Pin Groups</PageTitle>
      <Hint>Group pins together. The strip's switcher shows one group's pins at a time, or "All pins". Deleting a group ungroups its pins instead of removing them.</Hint>
      {ordered.length === 0 ? (
        <p className={styles.empty}>No groups yet.</p>
      ) : (
        <ul className={styles.list} aria-label="Groups">
          {ordered.map((g, i) => (
            <GroupRow key={g.id} group={g} index={i} first={i === 0} last={i === ordered.length - 1} count={pins.filter((p) => p.groupId === g.id).length} />
          ))}
        </ul>
      )}
      <form className={styles.add} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className={`${styles.field} ${styles.emoji} ${styles.box}`} aria-label="New group emoji" placeholder="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        <input className={`${styles.field} ${styles.box}`} style={{ flex: 1 }} aria-label="New group name" placeholder="New group name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <Button kind="primary" disabled={name.trim() === ""} onClick={add}>Add</Button>
      </form>
    </div>
  );
}
