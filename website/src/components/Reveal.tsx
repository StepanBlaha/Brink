"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ComponentProps } from "react";
import { easeOut } from "@/lib/motion";

type Tag = "div" | "h2" | "p" | "figure" | "ul" | "section";

type Props = Omit<ComponentProps<typeof motion.div>, "variants" | "initial" | "whileInView"> & {
  as?: Tag;
  /** Seconds before the reveal starts. */
  delay?: number;
  /** Stagger direct RevealItem children. */
  stagger?: number;
  y?: number;
};

export function useRevealVariants(y = 22, delay = 0, stagger = 0): Variants {
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : { duration: 0.8, ease: easeOut };
  return {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { ...t, delay, staggerChildren: stagger } },
  };
}

/**
 * Scroll-triggered reveal (once). Copy is SSR-rendered; the hidden state is
 * inline until hydration, and a <noscript> rule in the layout shows it without JS.
 */
export function Reveal({ as = "div", delay = 0, stagger = 0, y = 22, ...rest }: Props) {
  const variants = useRevealVariants(y, delay, stagger);
  const M = motion[as] as typeof motion.div;
  return (
    <M
      data-reveal
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      {...rest}
    />
  );
}

/** Child of a staggering Reveal. */
export function RevealItem({ y = 22, ...rest }: Omit<ComponentProps<typeof motion.div>, "variants"> & { y?: number }) {
  const variants = useRevealVariants(y);
  return <motion.div data-reveal variants={variants} {...rest} />;
}
