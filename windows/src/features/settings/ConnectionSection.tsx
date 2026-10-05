import { useState } from "react";
import { openUrl } from "../../ipc/captureIpc";
import { Button, PageTitle } from "./controls";
import { ConnectionStatusText } from "./ConnectionStatusText";
import { useConnection } from "./useConnection";
import styles from "./connection.module.css";
import { NOTION_INTEGRATIONS as INTEGRATIONS } from "../../domain/links";


/** Settings, Connection: token paste, test and disconnect. The Notion sign-in shows only when it is available. */
export function ConnectionSection() {
  const c = useConnection();
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const isOauth = c.auth?.kind === "oauth";
  const tokenVisible = !c.oauth || showToken || c.auth?.kind === "internal";
  const save = () => {
    const t = token;
    setToken("");
    void c.saveAndTest(t);
  };
  return (
    <div className={styles.page}>
      <PageTitle>Connect to Notion</PageTitle>
      {isOauth && (
        <div className={styles.card}>
          <div>{c.auth?.workspace?.workspaceName ?? "Notion workspace"}</div>
          <div className={styles.note}>Connected with Notion</div>
        </div>
      )}
      {c.oauth && !isOauth && (
        <div className={styles.stack}>
          <Button kind="primary" disabled={c.signingIn} onClick={() => void c.signIn()}>
            {c.signingIn ? "Waiting for Notion..." : "Connect to Notion"}
          </Button>
          <p className={styles.note}>Your browser opens Notion. Pick the pages and databases Brink may access, then click Allow.</p>
          {!showToken && c.auth?.kind == null && (
            <button type="button" className={styles.link} onClick={() => setShowToken(true)}>Use an integration token instead</button>
          )}
        </div>
      )}
      {tokenVisible && (
        <label className={styles.stack}>
          <span className={styles.note}>{c.oauth ? "Advanced: internal integration token" : "Internal integration token"}</span>
          <span className={styles.tokenRow}>
            <input
              className={styles.input}
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label="Integration token"
              placeholder={c.auth?.kind === "internal" ? "Token saved" : "secret_…"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && token.trim() !== "" && save()}
            />
            <Button kind="primary" disabled={token.trim() === ""} onClick={save}>Save</Button>
          </span>
        </label>
      )}
      <div className={styles.actions}>
        <Button disabled={!c.hasToken || c.status.kind === "testing"} onClick={() => void c.test()}>Test connection</Button>
        <Button kind="danger" disabled={!c.hasToken} onClick={() => void c.disconnect()}>Disconnect</Button>
      </div>
      <ConnectionStatusText status={c.status} />
      <hr className={styles.rule} />
      {isOauth ? (
        <p className={styles.note}>Brink sees only the pages you picked in Notion. To revoke access entirely, remove Brink under Notion, Settings, Connections.</p>
      ) : tokenVisible ? (
        <div className={styles.stack}>
          <p className={styles.note}>{c.hasToken ? "Token saved. It stays in Windows Credential Manager." : "No token yet. Paste one above."}</p>
          <button type="button" className={styles.link} onClick={() => void openUrl(INTEGRATIONS).catch(() => {})}>
            Create an integration at notion.so/profile/integrations
          </button>
          <p className={styles.note}>Share each page with your integration in Notion: page menu, Connections.</p>
        </div>
      ) : null}
    </div>
  );
}
