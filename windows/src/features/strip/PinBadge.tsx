import styles from "./strip.module.css";

/** Accent count bubble at an icon's top-right corner. Hidden at 0 (counts arrive with M6). */
export function PinBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className={styles.badge}>{count > 99 ? "99+" : count}</span>;
}
