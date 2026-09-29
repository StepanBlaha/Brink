"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import type { PointerEvent, ReactNode } from "react";

interface Props {
  href: string;
  className?: string;
  children: ReactNode;
  strength?: number;
}

/** Link that leans toward the cursor (mouse and pen only). */
export function MagneticLink({ href, className, children, strength = 0.32 }: Props) {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 16, mass: 0.6 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 16, mass: 0.6 });

  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const leave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.a
      href={href}
      className={className}
      style={{ x, y }}
      onPointerMove={move}
      onPointerLeave={leave}
      whileTap={reduce ? undefined : { scale: 0.96 }}
    >
      {children}
    </motion.a>
  );
}
