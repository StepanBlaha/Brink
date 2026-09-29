"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { easeOut } from "@/lib/motion";
import { Reveal, RevealItem } from "./Reveal";
import styles from "./Faq.module.css";

const subscribe = () => () => {};

interface Item {
  question: string;
  content: ReactNode;
}

/**
 * Button-based accordion. Until hydration every answer is in the HTML (hidden),
 * so crawlers and no-JS readers get the copy; afterwards AnimatePresence
 * animates the height of the open panels.
 */
export function FaqAccordion({ items }: { items: Item[] }) {
  const base = useId();
  const reduce = useReducedMotion();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [open, setOpen] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Reveal className={styles.faq} stagger={0.06}>
      {items.map((item, i) => {
        const isOpen = open.has(i);
        const panelId = `${base}-p${i}`;
        const body = <p>{item.content}</p>;
        return (
          <RevealItem key={item.question} className={styles.item} y={14}>
            <h3 className={styles.q}>
              <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggle(i)}>
                <span>{item.question}</span>
                <span className={styles.plus} data-open={isOpen} aria-hidden="true" />
              </button>
            </h3>
            <div id={panelId} role="region" aria-label={item.question}>
              {ready ? (
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="a"
                      className={styles.a}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={reduce ? { duration: 0 } : { duration: 0.42, ease: easeOut }}
                    >
                      {body}
                    </motion.div>
                  )}
                </AnimatePresence>
              ) : (
                <div className={styles.a} hidden>
                  {body}
                </div>
              )}
            </div>
          </RevealItem>
        );
      })}
    </Reveal>
  );
}
