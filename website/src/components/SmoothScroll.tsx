"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type LocomotiveScroll from "locomotive-scroll";

interface SmoothApi {
  /** Smooth-scrolls to a selector/element/offset. Returns false when smooth scroll is off. */
  scrollTo: (target: string | HTMLElement | number) => boolean;
  /** Pause / resume smooth scrolling (e.g. while a modal menu is open). No-op when smooth scroll is off. */
  stop: () => void;
  start: () => void;
}

const Ctx = createContext<SmoothApi>({ scrollTo: () => false, stop: () => {}, start: () => {} });
export const useSmoothScroll = () => useContext(Ctx);

/** Fired on document just before a same-page anchor click is smooth-scrolled. */
export const BEFORE_ANCHOR_SCROLL = "brink:before-anchor-scroll";

const stripSlash = (p: string) => p.replace(/\/+$/, "");

/** Client-only Locomotive Scroll (Lenis) provider. Off under prefers-reduced-motion. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const instance = useRef<LocomotiveScroll | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Re-init per route so data-scroll elements of the new page are picked up.
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    void import("locomotive-scroll").then(({ default: Loco }) => {
      if (cancelled) return;
      instance.current = new Loco({ lenisOptions: { lerp: 0.1, smoothWheel: true } });
    });
    return () => {
      cancelled = true;
      instance.current?.destroy();
      instance.current = null;
    };
  }, [pathname, reduced]);

  // Same-page anchors (#features, /#faq) scroll through Lenis.
  useEffect(() => {
    if (reduced) return;
    const onClick = (e: MouseEvent) => {
      const loco = instance.current;
      if (!loco || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !a.hash || a.origin !== location.origin) return;
      if (stripSlash(a.pathname) !== stripSlash(location.pathname)) return;
      const el = document.getElementById(decodeURIComponent(a.hash.slice(1)));
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      // This handler swallows the click before React sees it, so tell listeners (the mobile menu) first.
      document.dispatchEvent(new Event(BEFORE_ANCHOR_SCROLL));
      loco.start();
      loco.scrollTo(el, { duration: 1.3, force: true });
      history.pushState(null, "", a.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [reduced]);

  const api = useMemo<SmoothApi>(
    () => ({
      scrollTo: (target) => {
        if (!instance.current) return false;
        instance.current.scrollTo(target, { duration: 1.3, force: true });
        return true;
      },
      stop: () => instance.current?.stop(),
      start: () => instance.current?.start(),
    }),
    [],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
