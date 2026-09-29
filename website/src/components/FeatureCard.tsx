"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { useRevealVariants } from "./Reveal";
import styles from "./FeatureGrid.module.css";

interface Props {
  wide?: boolean;
  children: ReactNode;
}

/** Card with a cursor-following spotlight border, a light tilt and a lift on hover. */
export function FeatureCard({ wide, children }: Props) {
  const reduce = useReducedMotion();
  const variants = useRevealVariants(26);
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const glow = useMotionTemplate`radial-gradient(260px circle at ${mx}px ${my}px, rgba(10,132,255,0.16), transparent 70%)`;
  const edge = useMotionTemplate`radial-gradient(180px circle at ${mx}px ${my}px, rgba(94,176,255,0.95), transparent 70%)`;

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    mx.set(x);
    my.set(y);
    if (reduce) return;
    ry.set((x / r.width - 0.5) * 7);
    rx.set((0.5 - y / r.height) * 7);
  };
  const leave = () => {
    mx.set(-200);
    my.set(-200);
    rx.set(0);
    ry.set(0);
  };

  return (
    <motion.div
      data-reveal
      className={`${styles.cell} ${wide ? styles.wide : ""}`}
      variants={variants}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      whileHover={reduce ? undefined : { y: -4 }}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <motion.span className={styles.glow} style={{ background: glow }} aria-hidden="true" />
      <motion.span className={styles.edge} style={{ background: edge }} aria-hidden="true" />
      {children}
    </motion.div>
  );
}
