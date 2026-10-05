/** Roving focus for the strip: one tab stop, arrow keys move between the pin buttons. */

export type StripOrientation = "vertical" | "horizontal";

/** Index to focus after `key`, or null when the key does nothing. Wraps at both ends. */
export function nextIndex(key: string, current: number, count: number, o: StripOrientation): number | null {
  if (count <= 0) return null;
  const forward = o === "vertical" ? "ArrowDown" : "ArrowRight";
  const back = o === "vertical" ? "ArrowUp" : "ArrowLeft";
  if (key === forward) return (current + 1) % count;
  if (key === back) return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Spoken name of a pin button: the title and, when there are any, the badge count. */
export function pinLabel(title: string, count: number): string {
  if (count <= 0) return title;
  return `${title}, ${count} ${count === 1 ? "item" : "items"} open`;
}

/** Keydown handler for the strip container: moves focus among its `[data-roving]` buttons. */
export function handleStripKey(e: { key: string; currentTarget: Element; preventDefault(): void }, o: StripOrientation): void {
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-roving]"));
  const at = buttons.findIndex((b) => b === document.activeElement);
  if (at < 0) return;
  const next = nextIndex(e.key, at, buttons.length, o);
  if (next === null) return;
  e.preventDefault();
  buttons.forEach((b, i) => b.setAttribute("tabindex", i === next ? "0" : "-1"));
  buttons[next]?.focus();
}
