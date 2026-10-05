import { motion } from "motion/react";
import { GridIcon, PlusIcon } from "../notch/icons";
import type { NotchEdge, Rect } from "../notch/notchGeometry";
import { contents, stagger } from "../../theme/motion";
import type { NotchScale } from "../../theme/notchMetrics";
import { PinBadge } from "./PinBadge";
import { PinIcon } from "./PinIcon";
import type { GroupItem, PinItem } from "./pinItems";
import styles from "./strip.module.css";
import { useReorder } from "./useReorder";

interface Props {
  items: PinItem[];
  edge: NotchEdge;
  scale: NotchScale;
  selectedId: string | null;
  animate: boolean;
  reduce: boolean;
  /** Only the primary strip shows the switcher; the expanded rail is too narrow. */
  showGroupSwitcher: boolean;
  activeGroup?: GroupItem | undefined;
  badges?: Record<string, number>;
  onSelect: (item: PinItem, iconRect: Rect) => void;
  onAdd: (iconRect: Rect) => void;
  onReorder: (item: PinItem, toIndex: number) => void;
  onContextMenu: (item: PinItem, x: number, y: number) => void;
  onGroupMenu: (iconRect: Rect) => void;
  onPeekEnter?: ((item: PinItem, iconRect: Rect) => void) | undefined;
  onPeekLeave?: (() => void) | undefined;
}

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

/** The pin icon column (strip phase) or row (top edge); also the rail beside the open panel. */
export function Strip(p: Props) {
  const horizontal = p.edge === "top";
  const { iconSize, iconSpacing, stripPadding } = p.scale;
  const reorder = useReorder({
    count: p.items.length,
    stride: iconSize + iconSpacing,
    horizontal,
    canDrag: (i) => p.items[i]?.isToday === false,
    onDrop: (from, to) => {
      const item = p.items[from];
      if (item) p.onReorder(item, to);
    },
  });
  const appear = (i: number) =>
    p.animate
      ? {
          initial: { opacity: 0, [horizontal ? "x" : "y"]: 6 },
          animate: { opacity: 1, x: 0, y: 0 },
          transition: { ...contents, delay: stagger(i, p.reduce) },
        }
      : {};
  const ag = p.activeGroup;
  return (
    <div
      className={`${styles.strip} ${horizontal ? styles.row : styles.col}`}
      style={{
        gap: iconSpacing,
        [horizontal ? "paddingInline" : "paddingBlock"]: stripPadding,
        [horizontal ? "paddingBlock" : "paddingInline"]: 6,
      }}
    >
      {p.showGroupSwitcher && (
        <button
          type="button"
          className={`${styles.icon} ${styles.group}`}
          style={{ width: iconSize - 6, height: iconSize - 6, [horizontal ? "marginRight" : "marginBottom"]: 2 }}
          title={ag?.name ?? "All pins"}
          aria-label="Groups"
          data-group-switcher
          onClick={(e) => p.onGroupMenu(rectOf(e.currentTarget))}
        >
          {ag ? <span className={styles.groupLabel}>{ag.emoji || ag.name.slice(0, 1).toUpperCase()}</span> : <GridIcon />}
        </button>
      )}
      {p.items.map((item, i) => {
        const shift = reorder.offsetFor(i);
        const dragging = reorder.dragIndex === i;
        return (
          <div
            key={item.id}
            className={`${styles.slot} ${dragging ? styles.dragging : p.reduce ? "" : styles.slotShift}`}
            style={{ transform: `translate${horizontal ? "X" : "Y"}(${shift}px)` }}
            {...reorder.bind(i)}
          >
            <motion.button
              type="button"
              title={p.onPeekEnter ? "" : item.title}
              aria-label={item.title}
              data-pin={item.id}
              className={`${styles.icon} ${p.selectedId === item.id ? styles.selected : ""}`}
              style={{ width: iconSize, height: iconSize }}
              onClick={(e) => p.onSelect(item, rectOf(e.currentTarget))}
              onContextMenu={(e) => {
                e.preventDefault();
                p.onContextMenu(item, e.clientX, e.clientY);
              }}
              onMouseEnter={(e) => p.onPeekEnter?.(item, rectOf(e.currentTarget))}
              onMouseLeave={() => p.onPeekLeave?.()}
              {...appear(i)}
            >
              <PinIcon icon={item.icon} size={15 * p.scale.s} />
              <PinBadge count={p.badges?.[item.id] ?? 0} />
            </motion.button>
          </div>
        );
      })}
      <motion.button
        type="button"
        title="Add a page"
        aria-label="Add a page"
        data-add-pin
        className={`${styles.icon} ${styles.add}`}
        style={{ width: iconSize, height: iconSize }}
        onClick={(e) => p.onAdd(rectOf(e.currentTarget))}
        {...appear(p.items.length)}
      >
        <PlusIcon />
      </motion.button>
    </div>
  );
}
