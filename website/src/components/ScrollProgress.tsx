"use client";

import { motion, useScroll, useSpring } from "motion/react";
import styles from "./Header.module.css";

/** Thin accent-colored reading progress bar at the top of the viewport. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });
  return <motion.div className={styles.progress} style={{ scaleX }} aria-hidden="true" />;
}
