import { useState } from "react";
import { Layers } from "lucide-react";
import icon from "../../assets/brink-icon.png";
import { openUrl } from "../../ipc/captureIpc";
import { NOTION_INTEGRATIONS } from "../../domain/links";
import { TAGLINE } from "../about/AboutWindow";
import { Button } from "../settings/controls";
import { ConnectionStatusText } from "../settings/ConnectionStatusText";
import type { useConnection } from "../settings/useConnection";
import styles from "./onboarding.module.css";

export function Welcome() {
  return (
    <div className={styles.step}>
      <img src={icon} alt="Brink app icon" width={110} height={110} className={styles.icon} />
      <h1 className={styles.big}>Brink</h1>
      <p className={styles.tag}>{TAGLINE}</p>
      <p className={styles.small}>Pin the Notion pages and databases you use most, and check things off with one hover.</p>
    </div>
  );
}

/** Token paste and test, or the Notion sign-in when it is available. */
export function Connect({ c }: { c: ReturnType<typeof useConnection> }) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const useToken = !c.oauth || showToken;
  const test = () => {
    const t = token;
    setToken("");
    void c.saveAndTest(t);
  };
  return (
    <div className={styles.step}>
      <h1 className={styles.title}>Connect to Notion</h1>
      {useToken ? (
        <>
          <p className={styles.small}>Create an integration in Notion and paste its token below. Then share each page you want to pin with that integration (page menu, Connections).</p>
          <Button onClick={() => void openUrl(NOTION_INTEGRATIONS).catch(() => {})}>Open Notion integrations</Button>
          <input
            className={styles.token}
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label="Integration token"
            placeholder={c.hasToken ? "Token saved" : "secret_…"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (token.trim() !== "" || c.hasToken) && test()}
          />
          <div className={styles.actions}>
            <Button disabled={token.trim() === "" && !c.hasToken} onClick={test}>Test connection</Button>
            {c.oauth && <Button onClick={() => setShowToken(false)}>Back to Connect to Notion</Button>}
          </div>
        </>
      ) : (
        <>
          <p className={styles.small}>Your browser opens Notion. Pick the pages and databases Brink may use, then click Allow. Brink sees nothing else.</p>
          <Button kind="primary" disabled={c.signingIn} onClick={() => void c.signIn()}>{c.signingIn ? "Waiting for Notion..." : "Connect to Notion"}</Button>
          <button type="button" className={styles.linkBtn} onClick={() => setShowToken(true)}>Use an integration token instead</button>
        </>
      )}
      <div className={styles.status}>
        {c.status.kind === "idle" && c.hasToken ? <p className={styles.dim}>{c.auth?.kind === "oauth" ? "Connected." : "Token saved."}</p> : <ConnectionStatusText status={c.status} unit="pages" centered />}
      </div>
    </div>
  );
}

export function PinFirst() {
  return (
    <div className={styles.step}>
      <Layers size={40} strokeWidth={1.25} className={styles.accentIcon} aria-hidden />
      <h1 className={styles.title}>Pin your first page</h1>
      <p className={styles.small}>Brink lives on the edge of your screen. Hover it, tap +, and pick a page or database.</p>
    </div>
  );
}
