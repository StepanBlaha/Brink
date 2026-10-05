import { motion } from "motion/react";
import type { FakePin } from "./fakePins";
import { GridIcon, PlusIcon } from "./icons";
import styles from "./strip.module.css";
import type { NotchEdge, Rect } from "./notchGeometry";
import { contents, stagger } from "../../theme/motion";
import type { NotchScale } from "../../theme/notchMetrics";

interface Props {
  pins: FakePin[];
  edge: NotchEdge;
  scale: NotchScale;
  selectedId: string | null;
  animate: boolean;
  reduce: boolean;
  showGroupSwitcher: boolean;
  onSelect: (pin: FakePin, iconRect: Rect) => void;
  onAdd: () => void;
  onPeekEnter?: ((pin: FakePin, iconRect: Rect) => void) | undefined;
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
  const appear = (i: number) =>
    p.animate
      ? {
          initial: { opacity: 0, [horizontal ? "x" : "y"]: 6 },
          animate: { opacity: 1, x: 0, y: 0 },
          transition: { ...contents, delay: stagger(i, p.reduce) },
        }
      : {};
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
          style={{ width: iconSize, height: iconSize, [horizontal ? "marginRight" : "marginBottom"]: 2 }}
          title="Groups"
        >
          <GridIcon />
        </button>
      )}
      {p.pins.map((pin, i) => (
        <motion.button
          key={pin.id}
          type="button"
          title={pin.title}
          data-pin={pin.id}
          className={`${styles.icon} ${p.selectedId === pin.id ? styles.selected : ""}`}
          style={{ width: iconSize, height: iconSize, fontSize: 15 * p.scale.s }}
          onClick={(e) => p.onSelect(pin, rectOf(e.currentTarget))}
          onMouseEnter={(e) => p.onPeekEnter?.(pin, rectOf(e.currentTarget))}
          onMouseLeave={() => p.onPeekLeave?.()}
          {...appear(i)}
        >
          <span aria-hidden>{pin.icon}</span>
          {pin.badge ? (
            <span className={styles.badge}>{pin.badge > 99 ? "99+" : pin.badge}</span>
          ) : null}
        </motion.button>
      ))}
      <motion.button
        type="button"
        title="Add a page"
        className={`${styles.icon} ${styles.add}`}
        style={{ width: iconSize, height: iconSize }}
        onClick={p.onAdd}
        {...appear(p.pins.length)}
      >
        <PlusIcon />
      </motion.button>
    </div>
  );
}
