import { hexCss } from "../../theme/accent";
import { SWATCHES } from "./iconPickerModel";
import styles from "./iconPicker.module.css";

/** A row of accent colors for symbol and letter icons. */
export function Swatches({ value, onChange }: { value: number; onChange: (hex: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Icon color" className={styles.swatches}>
      {SWATCHES.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={s.hex === value}
          aria-label={s.name}
          title={s.name}
          className={`${styles.swatch} ${s.hex === value ? styles.swatchOn : ""}`}
          style={{ background: hexCss(s.hex) }}
          onClick={() => onChange(s.hex)}
        />
      ))}
    </div>
  );
}
