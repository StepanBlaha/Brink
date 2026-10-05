import { ACCENTS, accentHex, hexCss } from "../../theme/accent";
import type { AccentPreset } from "../../ipc/types";
import styles from "./appearance.module.css";

/** 11 presets in a 6-column grid; the selected one has a ring. */
export function AccentGrid({ value, system, onChange }: { value: AccentPreset; system: number | null; onChange: (p: AccentPreset) => void }) {
  return (
    <div role="radiogroup" aria-label="Accent color" className={styles.accents}>
      {ACCENTS.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={a.id === value}
          className={styles.accent}
          onClick={() => onChange(a.id)}
        >
          <span
            className={`${styles.swatch} ${a.id === value ? styles.swatchOn : ""}`}
            style={{ background: hexCss(accentHex(a.id, system)) }}
          >
            {a.id === "system" && <span className={styles.half} />}
          </span>
          <span className={styles.swatchName}>{a.name}</span>
        </button>
      ))}
    </div>
  );
}
