import type { ReactNode } from "react";
import { motion } from "motion/react";
import styles from "./notch.module.css";
import type { NotchLayout } from "./notchLayout";
import type { NotchPhase } from "./phaseMachine";
import { useNotchPath } from "./useNotchPath";

interface Props {
  layout: NotchLayout;
  phase: NotchPhase;
  reduce: boolean;
  outline: boolean;
  /** Hidden pill style while resting: the shape is not drawn at all. */
  visible: boolean;
  children: ReactNode;
}

/** Black morphing shape: shadow layer, clipped content, optional outline (NotchRootView). */
export function NotchShape({ layout, phase, reduce, outline, visible, children }: Props) {
  const { path, clip } = useNotchPath(layout, phase, reduce);
  const { width, height } = layout.windowSize;
  const shadow = phase === "resting" ? styles.shadowRest : styles.shadowOpen;
  return (
    <>
      <svg
        className={`${styles.layer} ${shadow} ${styles.fade}`}
        style={{ opacity: visible ? 1 : 0 }}
        width={width}
        height={height}
        aria-hidden
      >
        <motion.path d={path} fill="var(--notch-black)" />
      </svg>
      <motion.div className={styles.clip} style={{ clipPath: clip, opacity: visible ? 1 : 0 }}>
        {children}
      </motion.div>
      {outline && (
        <svg
          className={`${styles.layer} ${styles.fade}`}
          style={{ opacity: visible ? 1 : 0 }}
          width={width}
          height={height}
          aria-hidden
        >
          <motion.path
            d={path}
            fill="none"
            stroke={`rgba(255,255,255,${phase === "resting" ? 0.22 : 0.14})`}
            strokeWidth={1}
          />
        </svg>
      )}
    </>
  );
}
