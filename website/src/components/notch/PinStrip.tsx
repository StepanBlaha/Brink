"use client";

import { AnimatePresence, motion } from "motion/react";
import { contentSpring, instant, stagger } from "@/lib/motion";
import { pins } from "./pins";
import type { NotchApi } from "./useNotch";
import styles from "./NotchDemo.module.css";

/** The hover strip: four pin icons (staggered 45 ms, max 180 ms) plus the peek card. */
export function PinStrip({ n, reduce }: { n: NotchApi; reduce: boolean }) {
  return (
    <div className={styles.strip} role="group" aria-label="Pinned pages">
      {pins.map((p, i) => {
        const left = n.remaining(i).slice(0, 3);
        return (
          <motion.div
            key={p.id}
            className={styles.pinWrap}
            initial={reduce ? false : { opacity: 0, scale: 0.4, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, transition: reduce ? instant : { duration: 0.14, delay: stagger(pins.length - 1 - i) / 2 } }}
            transition={reduce ? instant : { ...contentSpring, delay: stagger(i) }}
          >
            <button
              type="button"
              className={styles.pin}
              data-pin={i}
              aria-label={`${p.title} pin. Open its list`}
              onClick={() => n.openPin(i)}
              onPointerEnter={() => n.setPeek(i)}
              onPointerLeave={() => n.setPeek(null)}
              onFocus={() => n.setPeek(i)}
              onBlur={() => n.setPeek(null)}
            >
              <span aria-hidden="true">{p.icon}</span>
            </button>
            <AnimatePresence>
              {n.peek === i && n.mode === "strip" && (
                <motion.div
                  className={styles.peek}
                  aria-hidden="true"
                  initial={reduce ? false : { opacity: 0, x: 10, scale: 0.94 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
                  transition={reduce ? instant : contentSpring}
                >
                  <b>{p.title}</b>
                  {left.length === 0 ? <span className={styles.done}>All done</span> : left.map((it) => (
                    <span key={it.id} className={styles.peekRow}><i />{it.text}</span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
