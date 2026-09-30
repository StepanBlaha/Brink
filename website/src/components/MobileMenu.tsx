"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { site } from "@/site";
import { easeOut } from "@/lib/motion";
import { BEFORE_ANCHOR_SCROLL, useSmoothScroll } from "./SmoothScroll";
import styles from "./MobileMenu.module.css";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#faq", label: "FAQ" },
  { href: "/press/", label: "Press" },
];

/** Hamburger + full-width black panel, shown below 640px. Portaled to <body> so the header's blur can't clip it. */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [lastPath, setLastPath] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const smooth = useSmoothScroll();
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) btn.current?.focus();
  }, []);

  // Close after navigation and when the viewport grows past the mobile breakpoint.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }
  useEffect(() => {
    const mq = matchMedia("(min-width: 641px)");
    const on = () => mq.matches && setOpen(false);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // While open: stop Locomotive/Lenis, lock native scroll, handle Esc and trap Tab.
  useEffect(() => {
    if (!open) return;
    smooth.stop();
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(true);
      } else if (e.key === "Tab") {
        const items = [btn.current, ...(panel.current?.querySelectorAll<HTMLElement>("a") ?? [])].filter(Boolean) as HTMLElement[];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1);
        e.preventDefault();
        items[next]?.focus();
      }
    };
    // Same-page anchor clicks are handled (and swallowed) by SmoothScroll: resume scrolling and close first.
    const onAnchor = () => {
      smooth.start();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener(BEFORE_ANCHOR_SCROLL, onAnchor);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener(BEFORE_ANCHOR_SCROLL, onAnchor);
      root.style.overflow = prev;
      smooth.start();
    };
  }, [open, close, smooth]);

  const t = reduce ? { duration: 0 } : { duration: 0.28, ease: easeOut };
  const item = (i: number) => (reduce ? { duration: 0 } : { duration: 0.35, ease: easeOut, delay: 0.04 * i + 0.05 });

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`${styles.bars} ${open ? styles.barsOpen : ""}`} aria-hidden="true"><i /><i /></span>
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.nav
                id={id}
                ref={panel}
                aria-label="Mobile"
                className={styles.panel}
                initial={{ opacity: 0, y: reduce ? 0 : -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -10 }}
                transition={t}
              >
                {links.map((l, i) => (
                  <motion.div key={l.href} initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={item(i)}>
                    <Link href={l.href} aria-current={l.href === pathname ? "page" : undefined} onClick={() => close(false)}>{l.label}</Link>
                  </motion.div>
                ))}
                <motion.div initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={item(links.length)}>
                  <a href={site.downloadUrl} onClick={() => close(false)}>Download</a>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={item(links.length + 1)}>
                  <a href={site.repoUrl} rel="noopener" onClick={() => close(false)}>GitHub</a>
                </motion.div>
              </motion.nav>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
