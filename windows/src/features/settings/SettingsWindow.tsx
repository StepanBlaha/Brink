import { useEffect } from "react";
import { initState } from "../../state/bridge";
import { ConnectionSection } from "./ConnectionSection";
import styles from "./settings.module.css";

/** Settings stub for M3: only the connection section. The full window is M8. */
export function SettingsWindow() {
  useEffect(() => {
    const stop = initState();
    return () => void stop.then((f) => f());
  }, []);
  return (
    <main className={styles.window}>
      <ConnectionSection />
    </main>
  );
}
