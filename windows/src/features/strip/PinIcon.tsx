import type { PinIconDisplay } from "./pinItems";
import { lucideFor } from "../iconPicker/lucideCatalog";
import styles from "./strip.module.css";

/** `0xRRGGBB` as a CSS color. */
export const hexColor = (hex: number): string => `#${(hex & 0xffffff).toString(16).padStart(6, "0")}`;

/** One pin icon, drawn the same in the strip and the panel header (PinIconView). */
export function PinIcon({ icon, size = 16 }: { icon: PinIconDisplay; size?: number }) {
  if (icon.kind === "emoji") {
    return (
      <span aria-hidden className={styles.glyph} style={{ fontSize: size }}>
        {icon.value}
      </span>
    );
  }
  if (icon.kind === "symbol") {
    const Glyph = lucideFor(icon.name);
    if (Glyph) {
      return <Glyph aria-hidden size={size + 2} strokeWidth={2.2} color={hexColor(icon.colorHex)} />;
    }
  }
  const d = size + 8;
  return (
    <span
      aria-hidden
      className={styles.letter}
      style={{ width: d, height: d, fontSize: size - 4, background: hexColor(icon.colorHex) }}
    >
      {icon.kind === "letter" ? icon.text : "◆"}
    </span>
  );
}
