"use client";

import { useState, type ReactNode } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { softSpring } from "@/lib/motion";
import styles from "./Header.module.css";

/** Sticky header that hides while scrolling down and returns on scroll up. */
export function HeaderShell({ children }: { children: ReactNode }) {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [focused, setFocused] = useState(false);

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    if (y < 120) setHidden(false);
    else if (y > prev + 2) setHidden(true);
    else if (y < prev - 2) setHidden(false);
  });

  return (
    <motion.header
      className={styles.head}
      animate={{ y: hidden && !focused ? "-101%" : "0%" }}
      transition={softSpring}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      {children}
    </motion.header>
  );
}
