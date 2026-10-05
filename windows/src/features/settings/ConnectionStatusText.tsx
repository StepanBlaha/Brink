import { itemsText, pagesText, type ConnectionStatus } from "./useConnection";
import styles from "./connection.module.css";

/** The one status line under the token field (Settings says items, onboarding says pages). */
export function ConnectionStatusText({ status, unit = "items", centered }: { status: ConnectionStatus; unit?: "items" | "pages"; centered?: boolean }) {
  const cls = centered ? styles.centered : "";
  if (status.kind === "testing") return <p role="status" className={`${styles.note} ${cls}`}>Checking...</p>;
  if (status.kind === "connected") {
    const n = unit === "pages" ? pagesText(status.count) : itemsText(status.count);
    return <p role="status" className={`${styles.ok} ${cls}`}>{`Connected. Brink can see ${n}.`}</p>;
  }
  if (status.kind === "error") return <p role="alert" className={`${styles.err} ${cls}`}>{status.message}</p>;
  return null;
}
