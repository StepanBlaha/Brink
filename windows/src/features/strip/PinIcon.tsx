import type { PinIconDisplay } from "./pinItems";
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
