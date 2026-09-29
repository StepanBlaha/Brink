import { FeatureSection } from "./FeatureSection";
import { Reveal } from "./Reveal";
import styles from "./Customization.module.css";

const options = ["Edge: left, right or top", "Display", "Pill style", "Small / Medium / Large", "@accent", "Sounds", "Launch at login", "Auto-hide"];
const swatches = ["#0a84ff", "#30d158", "#ff9f0a", "#bf5af2"];

function Swatch({ color }: { color: string }) {
  return <i className={styles.swatch} style={{ background: color }} />;
}

export function Customization() {
  return (
    <FeatureSection
      tight
      eyebrow="Customization"
      title="Make the notch yours."
      extra={
        <div className={styles.opts} role="list" aria-label="Customization options">
          {options.map((o) =>
            o === "@accent" ? (
              <span key={o} role="listitem"><Swatch color="#0a84ff" />Accent color</span>
            ) : (
              <span key={o} role="listitem">{o}</span>
            ),
          )}
        </div>
      }
      media={
        <Reveal className={styles.card}>
          <div className={styles.row}><b>Edge</b><span className={styles.chip}>Right</span></div>
          <div className={styles.row}><b>Display</b><span className={styles.end}>Built-in</span></div>
          <div className={styles.row}><b>Size</b><span className={styles.end}>Medium</span></div>
          <div className={styles.row}>
            <b>Accent</b>
            <span className={styles.end}>{swatches.map((c) => <Swatch key={c} color={c} />)}</span>
          </div>
          <div className={styles.row}><b>Sounds</b><span className={styles.end}>On</span></div>
        </Reveal>
      }
    >
      Brink is calm by default and flexible when you want it.
    </FeatureSection>
  );
}
