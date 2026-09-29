"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect } from "react";
import styles from "./Hero.module.css";

/** Soft accent glow that trails the mouse across the hero (pointer devices only). */
export function HeroGlow() {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(720), { stiffness: 60, damping: 20 });
  const y = useSpring(useMotionValue(300), { stiffness: 60, damping: 20 });
  const bg = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, rgba(10,132,255,0.2), transparent 70%)`;

  useEffect(() => {
    if (reduce) return;
    const host = document.getElementById("hero");
    if (!host) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = host.getBoundingClientRect();
      x.set(e.clientX - r.left);
      y.set(e.clientY - r.top);
    };
    host.addEventListener("pointermove", move);
    return () => host.removeEventListener("pointermove", move);
  }, [reduce, x, y]);

  if (reduce) return null;
  return <motion.div className={styles.spot} style={{ background: bg }} aria-hidden="true" />;
}
