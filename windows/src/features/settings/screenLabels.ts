import type { ScreenInfo } from "../../domain/store/displayPreference";

/** Picker names: a nameless screen becomes "Display N"; duplicate names get a number. */
export function screenLabels(screens: ScreenInfo[]): string[] {
  const total = new Map<string, number>();
  for (const s of screens) total.set(s.name, (total.get(s.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return screens.map((s, i) => {
    const base = s.name === "" ? `Display ${i + 1}` : s.name;
    if ((total.get(s.name) ?? 0) < 2 || s.name === "") return base;
    const n = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, n);
    return `${base} ${n}`;
  });
}
