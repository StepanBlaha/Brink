import { hexCss } from "../../theme/accent";
import { LUCIDE_CATALOG, lucideFor } from "./lucideCatalog";
import { Swatches } from "./Swatches";
import styles from "./iconPicker.module.css";

/** Lucide symbols, 6 columns, tinted with the chosen swatch. */
export function SymbolTab({ color, onColor, onPick }: { color: number; onColor: (hex: number) => void; onPick: (name: string) => void }) {
  return (
    <div className={styles.tabBody}>
      <Swatches value={color} onChange={onColor} />
      <div className={`${styles.scroll} ${styles.symbols}`}>
        {LUCIDE_CATALOG.map((name) => {
          const Icon = lucideFor(name);
          return Icon ? (
            <button key={name} type="button" className={styles.cell} aria-label={name.replaceAll("-", " ")} onClick={() => onPick(name)}>
              <Icon size={18} strokeWidth={2.2} color={hexCss(color)} aria-hidden />
            </button>
          ) : null;
        })}
      </div>
    </div>
  );
}
