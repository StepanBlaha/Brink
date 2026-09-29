"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pins } from "./pins";

export type NotchMode = "rest" | "strip" | "panel";

/** State machine for the demo: rest -> strip -> panel, driven by hover, focus, tap, Esc, outside click. */
export function useNotch(rootRef: React.RefObject<HTMLElement | null>) {
  const [mode, setMode] = useState<NotchMode>("rest");
  const [active, setActive] = useState(0);
  const [peek, setPeek] = useState<number | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const timers = useRef<number[]>([]);
  const hovering = useRef(false);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const collapse = useCallback(() => {
    setMode("rest");
    setPeek(null);
  }, []);

  useEffect(() => {
    if (mode === "rest") return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) collapse();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "panel") {
        setMode("strip");
        requestAnimationFrame(() =>
          rootRef.current?.querySelector<HTMLElement>(`[data-pin="${active}"]`)?.focus({ preventScroll: true }),
        );
      } else collapse();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mode, active, collapse, rootRef]);

  const hoverIn = (type: string) => {
    if (type === "touch") return;
    hovering.current = true;
    setMode((m) => (m === "rest" ? "strip" : m));
  };
  const hoverOut = (type: string) => {
    if (type === "touch") return;
    hovering.current = false;
    setMode((m) => (m === "strip" ? "rest" : m));
    setPeek(null);
  };
  const focusIn = () => setMode((m) => (m === "rest" ? "strip" : m));
  const focusOut = (e: React.FocusEvent) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node | null) && !hovering.current) collapse();
  };
  const openStrip = () => setMode((m) => (m === "rest" ? "strip" : m));
  const openPin = (i: number) => {
    setActive(i);
    setPeek(null);
    setMode("panel");
  };

  const tick = (itemId: string, text: string, instant: boolean) => {
    setTicked((s) => new Set(s).add(itemId));
    setStatus(`Ticked ${text}`);
    if (instant) return setGone((s) => new Set(s).add(itemId));
    timers.current.push(window.setTimeout(() => setGone((s) => new Set(s).add(itemId)), 620));
  };
  const untick = (itemId: string) => {
    setTicked((s) => { const n = new Set(s); n.delete(itemId); return n; });
  };
  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTicked(new Set());
    setGone(new Set());
    setStatus("List reset");
  };

  const remaining = (i: number) => pins[i]!.items.filter((it) => !gone.has(it.id));
  return { mode, active, peek, setPeek, ticked, gone, status, hoverIn, hoverOut, focusIn, focusOut, openStrip, openPin, tick, untick, reset, remaining, setActive };
}

export type NotchApi = ReturnType<typeof useNotch>;
