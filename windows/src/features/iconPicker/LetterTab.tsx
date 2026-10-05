import { useState } from "react";
import type { Pin } from "../../domain/store/pin";
import { hexCss } from "../../theme/accent";
import { letterText, normalizeLetters } from "./iconPickerModel";
import { Swatches } from "./Swatches";
import styles from "./iconPicker.module.css";

/** One or two letters on a colored disc. */
export function LetterTab({ pin, color, onColor, onUse }: { pin: Pin; color: number; onColor: (hex: number) => void; onUse: (text: string) => void }) {
  const [typed, setTyped] = useState("");
  return (
    <div className={`${styles.tabBody} ${styles.letterBody}`}>
      <div className={styles.disc} style={{ background: hexCss(color) }} aria-hidden>{typed === "" ? "A" : typed}</div>
      <input
        className={`${styles.search} ${styles.letterInput}`}
        aria-label="Letters"
        placeholder="1-2 letters"
        value={typed}
        onChange={(e) => setTyped(normalizeLetters(e.target.value))}
        onKeyDown={(e) => e.key === "Enter" && onUse(letterText(typed, pin))}
      />
      <Swatches value={color} onChange={onColor} />
      <button type="button" className={styles.use} onClick={() => onUse(letterText(typed, pin))}>Use</button>
    </div>
  );
}
