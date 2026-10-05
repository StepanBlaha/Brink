import { useEffect, useRef } from "react";
import styles from "./database.module.css";

export interface MenuItem {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface Props {
  x: number;
  y: number;
  title: string;
  items: (MenuItem | "divider")[];
  onClose: () => void;
}

/** Small fixed-position menu (the snooze context menu). Closes on outside press, Escape and scroll. */
export function ContextMenu({ x, y, title, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const left = Math.max(4, Math.min(x, window.innerWidth - 190));
  const top = Math.max(4, Math.min(y, window.innerHeight - 150));
  return (
    <div ref={ref} className={styles.menu} style={{ left, top }} role="menu" aria-label={title}>
      <div className={styles.menuTitle}>{title}</div>
      {items.map((it, i) =>
        it === "divider" ? (
          <div key={i} className={styles.menuDivider} />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}
