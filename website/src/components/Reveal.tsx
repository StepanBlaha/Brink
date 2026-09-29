"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef, type ElementType } from "react";
import styles from "./Reveal.module.css";

type Props<T extends ElementType> = { as?: T } & ComponentPropsWithoutRef<T>;

/**
 * Fades content in as it scrolls into view. Server HTML is fully visible; the
 * hidden state is only applied after hydration to below-the-fold elements, so
 * no-JS and reduced-motion visitors always see everything.
 */
export function Reveal<T extends ElementType = "div">({ as, className, ...rest }: Props<T>) {
  const Tag: ElementType = as ?? "div";
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    const [pre, shown] = [styles.pre ?? "", styles.in ?? ""];
    el.classList.add(pre);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.classList.add(shown);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <Tag ref={ref} className={className} {...rest} />;
}
