"use client";

import { AnimatePresence, motion } from "motion/react";
import { contentSpring, instant } from "@/lib/motion";
import { pins } from "./pins";
import { TaskRow } from "./TaskRow";
import type { NotchApi } from "./useNotch";
import styles from "./NotchDemo.module.css";

/** Expanded panel: pin tabs, the active pin's checklist and a reset button. */
export function PinPanel({ n, reduce }: { n: NotchApi; reduce: boolean }) {
  const pin = pins[n.active]!;
  const rows = pin.items.filter((it) => !n.gone.has(it.id));
  return (
    <motion.div
      className={styles.panel}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
      transition={reduce ? instant : { ...contentSpring, delay: 0.12 }}
    >
      <div className={styles.tabs} role="tablist" aria-label="Pinned pages">
        {pins.map((p, i) => (
          <button key={p.id} type="button" role="tab" aria-selected={i === n.active} data-pin={i}
            aria-label={p.title} className={styles.tab} onClick={() => n.setActive(i)}>
            <span aria-hidden="true">{p.icon}</span>
          </button>
        ))}
      </div>
      <h3 className={styles.ptitle}>{pin.title}</h3>
      <ul className={styles.list} aria-label={`${pin.title} items`}>
        <AnimatePresence initial={false}>
          {rows.map((it) => (
            <TaskRow key={it.id} item={it} reduce={reduce} checked={n.ticked.has(it.id)}
              onTick={() => n.tick(it.id, it.text, reduce)} />
          ))}
        </AnimatePresence>
      </ul>
      {rows.length === 0 && <p className={styles.empty}>All done. Nothing left on the edge.</p>}
      <button type="button" className={styles.reset} onClick={n.reset}>Reset</button>
    </motion.div>
  );
}
