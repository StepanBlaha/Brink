import { useEffect, useState } from "react";
import { autostartSet, autostartStatus, openStartupSettings, type AutostartStatus } from "../../ipc/windowsIpc";
import { errorMessage } from "../pinning/usePinSearch";
import { Button, Toggle } from "./controls";
import styles from "./appearance.module.css";

/** Copy for each state (plan 3.i). */
export const STARTUP_TEXT: Record<AutostartStatus, string> = {
  enabled: "Enabled.",
  disabledByUser: "Turned off in Windows Settings, Apps, Startup.",
  off: "Not enabled.",
};

/** "Launch Brink when you sign in", backed by the Run key; shows what Windows really says. */
export function StartupRow() {
  const [status, setStatus] = useState<AutostartStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const read = () => void autostartStatus().then(setStatus).catch(() => {});
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  const set = async (on: boolean) => {
    setError(null);
    try {
      setStatus(await autostartSet(on));
    } catch (e) {
      setError(errorMessage(e, "Could not change this."));
    }
  };
  return (
    <div className={styles.startup}>
      <Toggle label="Launch Brink when you sign in" checked={status === "enabled" || status === "disabledByUser"} onChange={(v) => void set(v)} />
      {status !== null && <p className={status === "disabledByUser" ? styles.warn : styles.note}>{STARTUP_TEXT[status]}</p>}
      {status === "disabledByUser" && <Button onClick={() => void openStartupSettings().catch(() => {})}>Open Startup settings</Button>}
      {error !== null && <p className={styles.warn}>{error}</p>}
    </div>
  );
}
