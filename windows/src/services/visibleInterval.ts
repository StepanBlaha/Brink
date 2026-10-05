/**
 * `setInterval` that does nothing while the window is hidden (minimized, covered by a full
 * screen app, tray flyout closed) and catches up once with one run when it shows again.
 * Returns the stop function.
 */
export function visibleInterval(fn: () => void, ms: number, doc: Document | undefined = typeof document === "undefined" ? undefined : document): () => void {
  if (!doc) {
    const t = setInterval(fn, ms);
    return () => clearInterval(t);
  }
  let missed = false;
  const hidden = (): boolean => doc.visibilityState === "hidden";
  const timer = setInterval(() => {
    if (hidden()) missed = true;
    else fn();
  }, ms);
  const onVisible = (): void => {
    if (!hidden() && missed) {
      missed = false;
      fn();
    }
  };
  doc.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(timer);
    doc.removeEventListener("visibilitychange", onVisible);
  };
}
