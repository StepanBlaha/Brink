"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { easeOut } from "@/lib/motion";

/** Figure that fades and scales in when scrolled into view. */
export function MediaReveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.figure
      data-reveal
      className={className}
      style={{ margin: 0, minWidth: 0 }}
      initial={reduce ? false : { opacity: 0, scale: 0.92, y: 24 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 1, ease: easeOut }}
    >
      {children}
    </motion.figure>
  );
}
