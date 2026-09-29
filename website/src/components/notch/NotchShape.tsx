"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { instant, notchSpring } from "@/lib/motion";
import type { NotchMode } from "./useNotch";
import styles from "./NotchDemo.module.css";

const size: Record<NotchMode, { width: number; height: number; marginTop: number; borderRadius: string }> = {
  rest: { width: 20, height: 92, marginTop: -46, borderRadius: "12px 0 0 12px" },
  strip: { width: 64, height: 204, marginTop: -102, borderRadius: "22px 0 0 22px" },
  panel: { width: 252, height: 318, marginTop: -159, borderRadius: "26px 0 0 26px" },
};

interface Props {
  mode: NotchMode;
  reduce: boolean;
  children: ReactNode;
  pill: ReactNode;
  onPointerEnter: (e: React.PointerEvent) => void;
  onPointerLeave: (e: React.PointerEvent) => void;
}

/** The single black shape (pill -> strip -> panel) with concave flares where it meets the bezel. */
export function NotchShape({ mode, reduce, children, pill, onPointerEnter, onPointerLeave }: Props) {
  return (
    <motion.div
      className={styles.notch}
      data-mode={mode}
      initial={false}
      animate={size[mode]}
      transition={reduce ? instant : notchSpring}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <span className={`${styles.flare} ${styles.flareTop}`} aria-hidden="true" />
      <span className={`${styles.flare} ${styles.flareBottom}`} aria-hidden="true" />
      {pill}
      <AnimatePresence>{children}</AnimatePresence>
    </motion.div>
  );
}
