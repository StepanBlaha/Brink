import { useEffect, useRef, useState } from "react";
import type { Rect } from "../notch/notchGeometry";
import { Popover } from "./Popover";
import styles from "./common.module.css";

export type MenuEntry =
  | { kind: "item"; id: string; label: string; checked?: boolean; danger?: boolean; disabled?: boolean; keepOpen?: boolean; onSelect: () => void }
  | { kind: "submenu"; id: string; label: string; items: MenuEntry[] }
  | { kind: "divider"; id: string };

interface Props {
  x: number;
  y: number;
  label: string;
  items: MenuEntry[];
  align?: "start" | "end";
  onRect?: (r: Rect | null) => void;
  onClose: () => void;
}

const selectable = (items: MenuEntry[]) => items.filter((i) => i.kind !== "divider");

/** Context menu: arrows move, Enter and click select, Right/Left open and close a submenu, Esc closes. */
export function Menu({ x, y, label, items, align, onRect, onClose }: Props) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const rows = selectable(items);

  useEffect(() => root.current?.focus(), []);

  const choose = (entry: MenuEntry | undefined) => {
    if (!entry) return;
    if (entry.kind === "item") {
      if (entry.disabled) return;
      if (!entry.keepOpen) onClose();
      entry.onSelect();
    } else if (entry.kind === "submenu") setOpen(entry.id);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = (d: number) => setActive((a) => (a + d + rows.length) % Math.max(rows.length, 1));
    if (e.key === "ArrowDown") step(1);
    else if (e.key === "ArrowUp") step(-1);
    else if (e.key === "Enter" || e.key === " ") choose(rows[active]);
    else if (e.key === "ArrowRight" && rows[active]?.kind === "submenu") setOpen(rows[active].id);
    else if (e.key === "ArrowLeft" && open) setOpen(null);
    else if (e.key === "Escape") onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Popover x={x} y={y} label={label} {...(align ? { align } : {})} {...(onRect ? { onRect } : {})}>
      <div ref={root} role="menu" tabIndex={-1} className={styles.menu} onKeyDown={onKey}>
        {items.map((entry) => {
          if (entry.kind === "divider") return <div key={entry.id} className={styles.divider} role="separator" />;
          const index = rows.indexOf(entry);
          const isActive = index === active;
          return (
            <div key={entry.id} className={styles.itemWrap}>
              <button
                type="button"
                role="menuitem"
                data-menu-item={entry.id}
                disabled={entry.kind === "item" && entry.disabled === true}
                className={`${styles.item} ${isActive ? styles.active : ""} ${entry.kind === "item" && entry.danger ? styles.danger : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(entry)}
              >
                <span className={styles.check}>{entry.kind === "item" && entry.checked ? "✓" : ""}</span>
                <span className={styles.label}>{entry.label}</span>
                {entry.kind === "submenu" && <span className={`${styles.chev} ${open === entry.id ? styles.open : ""}`}>{"›"}</span>}
              </button>
              {entry.kind === "submenu" && open === entry.id && (
                <div className={styles.sub} role="menu">
                  {entry.items.map((s) =>
                    s.kind === "item" ? (
                      <button
                        key={s.id}
                        type="button"
                        role="menuitem"
                        data-menu-item={s.id}
                        disabled={s.disabled === true}
                        className={styles.item}
                        onClick={() => choose(s)}
                      >
                        <span className={styles.check}>{s.checked ? "✓" : ""}</span>
                        <span className={styles.label}>{s.label}</span>
                      </button>
                    ) : s.kind === "divider" ? (
                      <div key={s.id} className={styles.divider} role="separator" />
                    ) : null,
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Popover>
  );
}
