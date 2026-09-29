"use client";

import { motion, useReducedMotion } from "motion/react";
import { easeOut } from "@/lib/motion";
import styles from "./SplitText.module.css";

interface Props {
  text: string;
  delay?: number;
  /** Seconds between words. */
  step?: number;
  className?: string;
}

/** Word-by-word masked rise on load. Text stays real, selectable HTML. */
export function SplitText({ text, delay = 0, step = 0.05, className }: Props) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { delayChildren: reduce ? 0 : delay, staggerChildren: reduce ? 0 : step } } }}
    >
      {words.map((w, i) => (
        <span key={i}>
          <span className={styles.mask}>
            <motion.span
              data-reveal
              className={styles.word}
              variants={{
                hidden: reduce ? { y: 0, opacity: 1 } : { y: "105%", opacity: 0 },
                show: { y: 0, opacity: 1, transition: reduce ? { duration: 0 } : { duration: 0.85, ease: easeOut } },
              }}
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </motion.span>
  );
}
