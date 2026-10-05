import type { CustomIcon, Pin } from "../../domain/store/pin";
import { ACCENTS, BLUE } from "../../theme/accent";

/** Swatches for custom icons: the presets without "System accent" (an icon needs a fixed hex). */
export const SWATCHES = ACCENTS.flatMap((a) => (a.hex === null ? [] : [{ id: a.id, name: a.name, hex: a.hex }]));
export const DEFAULT_SWATCH = BLUE;

const graphemes = (s: string): string[] => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);

/** Letter field: uppercase, at most two characters. */
export const normalizeLetters = (input: string): string => graphemes(input.toUpperCase().trim()).slice(0, 2).join("");

/** What "Use" stores: the typed letters, else the pin title's first letter. */
export function letterText(typed: string, pin: Pick<Pin, "title">): string {
  const t = normalizeLetters(typed);
  return t !== "" ? t : (graphemes(pin.title.trim())[0] ?? "").toUpperCase();
}

/** The first character an emoji panel inserted, or null when it inserted nothing. */
export const insertedEmoji = (inserted: string): string | null => graphemes(inserted.trim())[0] ?? null;

export const emojiIcon = (value: string): CustomIcon => ({ kind: "emoji", value });
export const symbolIcon = (name: string, colorHex: number): CustomIcon => ({ kind: "lucide", name, colorHex });
export const letterIcon = (value: string, colorHex: number): CustomIcon => ({ kind: "letter", value, colorHex });

/** The pin with `icon` set, or cleared (back to Notion's icon) when `icon` is undefined. */
export function withCustomIcon(pin: Pin, icon: CustomIcon | undefined): Pin {
  const { customIcon: _drop, ...rest } = pin;
  void _drop;
  return icon ? { ...rest, customIcon: icon } : rest;
}
