import { CountUp } from "./CountUp";
import { Reveal, RevealItem } from "./Reveal";
import styles from "./Stats.module.css";

const stats = [
  { to: 3, label: "screen edges to choose from" },
  { to: 3, prefix: "<", suffix: " s", label: "from hotkey to captured task" },
  { to: 190, suffix: "+", label: "automated tests behind the sync" },
  { to: 0, label: "servers, trackers or analytics" },
];

export function Stats() {
  return (
    <section className={styles.section} aria-label="Brink in numbers">
      <div className="wrap">
        <Reveal role="list" stagger={0.09} className={styles.list}>
          {stats.map((s) => (
            <RevealItem key={s.label} role="listitem" className={styles.item}>
              <b>{s.to === 0 ? "0" : <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />}</b>
              <span>{s.label}</span>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
