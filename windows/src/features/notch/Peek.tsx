import { motion } from "motion/react";
import { type FakePin, peekSubtitle } from "./fakePins";
import styles from "./peek.module.css";
import type { NotchEdge, Rect } from "./notchGeometry";
import { contents, instant } from "../../theme/motion";

interface Props {
  pin: FakePin;
  rect: Rect;
  edge: NotchEdge;
  fontScale: number;
  reduce: boolean;
  onHover: (h: boolean) => void;
  onOpen: () => void;
}

const ORIGIN = { right: "100% 50%", left: "0% 50%", top: "50% 0%" } as const;

/** Hover peek card: title, summary subtitle, up to 3 next items. */
export function Peek({ pin, rect, edge, fontScale, reduce, onHover, onOpen }: Props) {
  const scale = reduce ? 1 : 0.92;
  return (
    <motion.div
      className={styles.card}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        transformOrigin: ORIGIN[edge],
        fontSize: 12 * fontScale,
      }}
      initial={{ opacity: 0, scale }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale }}
      transition={reduce ? instant : contents}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onOpen}
    >
      <div className={styles.title}>{pin.title}</div>
      <div className={styles.sub}>{peekSubtitle(pin)}</div>
      {pin.next.slice(0, 3).map((t) => (
        <div key={t.id} className={styles.item}>
          <span className={`${styles.box} ${t.done ? styles.checked : ""}`} />
          <span className={t.done ? styles.done : undefined}>{t.title}</span>
        </div>
      ))}
    </motion.div>
  );
}
