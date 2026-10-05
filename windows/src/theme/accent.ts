import type { AccentPreset } from "../ipc/types";

/** Accent presets (AccentPreset in Settings.swift). `system` follows the Windows accent color. */
export const ACCENTS: { id: AccentPreset; name: string; hex: number | null }[] = [
  { id: "pink", name: "Pink", hex: 0xff375f },
  { id: "red", name: "Red", hex: 0xff453a },
  { id: "orange", name: "Orange", hex: 0xff9f0a },
  { id: "yellow", name: "Yellow", hex: 0xffd60a },
  { id: "green", name: "Green", hex: 0x32d74b },
  { id: "teal", name: "Teal", hex: 0x40c8e0 },
  { id: "blue", name: "Blue", hex: 0x0a84ff },
  { id: "indigo", name: "Indigo", hex: 0x5e5ce6 },
  { id: "purple", name: "Purple", hex: 0xbf5af2 },
  { id: "offWhite", name: "Off-White", hex: 0xf2f2f0 },
  { id: "system", name: "System accent", hex: null },
];

export const BLUE = 0x0a84ff;

/** The color of a preset; `system` uses the live Windows accent and falls back to blue. */
export function accentHex(preset: AccentPreset, system: number | null): number {
  const found = ACCENTS.find((a) => a.id === preset);
  return found?.hex ?? system ?? BLUE;
}

export const hexCss = (hex: number): string => `#${(hex & 0xffffff).toString(16).padStart(6, "0")}`;

/** Text on an accent fill: black on light accents (yellow, off-white), white otherwise. */
export function onAccent(hex: number): string {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#000" : "#fff";
}
