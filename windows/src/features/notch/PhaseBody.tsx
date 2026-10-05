import type { ReactNode } from "react";
import { motion } from "motion/react";
import styles from "./notch.module.css";
import { contents, edgeOffset, instant } from "../../theme/motion";
import type { NotchEdge, Rect } from "./notchGeometry";

interface Props {
  rect: Rect;
  edge: NotchEdge;
  reduce: boolean;
  children: ReactNode;
}

/**
 * One phase's content at its own final size. It slides out of the screen edge as the shape
 * unfolds (insert delayed 0.06 s) and back into it as the shape folds (Theme.Motion.phaseTransition).
 */
export function PhaseBody({ rect, edge, reduce, children }: Props) {
  const off = reduce ? { x: 0, y: 0 } : edgeOffset(edge);
  return (
    <motion.div
      className={styles.body}
      style={{ left: rect.x, top: rect.y, width: Math.max(rect.width, 0), height: Math.max(rect.height, 0) }}
      initial={{ opacity: 0, ...off }}
      animate={{ opacity: 1, x: 0, y: 0, transition: reduce ? instant : { ...contents, delay: 0.06 } }}
      exit={{ opacity: 0, ...off, transition: reduce ? instant : contents }}
    >
      {children}
    </motion.div>
  );
}
