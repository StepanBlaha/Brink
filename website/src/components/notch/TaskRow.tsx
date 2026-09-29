"use client";

import { motion } from "motion/react";
import { contentSpring, instant } from "@/lib/motion";
import type { PinItem } from "./pins";
import styles from "./NotchDemo.module.css";

interface Props {
  item: PinItem;
  checked: boolean;
  reduce: boolean;
  onTick: () => void;
}

/** One checkbox row: tick fills accent, text strikes through, then AnimatePresence removes it. */
export function TaskRow({ item, checked, reduce, onTick }: Props) {
  return (
    <motion.li
      layout={!reduce}
      className={styles.row}
      initial={reduce ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0, transition: instant } : { opacity: 0, x: -36, height: 0, transition: { duration: 0.32 } }}
      transition={reduce ? instant : contentSpring}
    >
      <label>
        <input type="checkbox" checked={checked} onChange={onTick} disabled={checked} />
        <span className={styles.box} aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12">
            <motion.path
              d="M2.5 6.2 5 8.6 9.5 3.6" fill="none" stroke="#fff" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round"
              initial={false} animate={{ pathLength: checked ? 1 : 0 }} transition={reduce ? instant : { duration: 0.25 }}
            />
          </svg>
        </span>
        <span className={styles.txt} data-done={checked}>
          {item.text}
          <motion.i className={styles.strike} initial={false} animate={{ scaleX: checked ? 1 : 0 }} transition={reduce ? instant : { duration: 0.28 }} />
        </span>
      </label>
    </motion.li>
  );
}
