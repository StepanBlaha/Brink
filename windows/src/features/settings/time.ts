/** `HH:mm` for a minute-of-day (0 to 1439), as the time input wants it. */
export function formatMinutes(total: number): string {
  const t = Math.min(Math.max(Math.round(total), 0), 1439);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Minute-of-day for `HH:mm`, or null for an empty or invalid value. */
export function parseMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}
