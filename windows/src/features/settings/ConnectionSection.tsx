import { useState } from "react";
import { authDisconnect, authSaveToken, authTestConnection } from "../../ipc/commands";
import { isConnected, useAuthStore } from "../../state/authStore";
import { errorMessage } from "../pinning/usePinSearch";
import styles from "./settings.module.css";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; text: string } | { kind: "error"; text: string };

/** Minimal connection screen: paste an integration token, test it, disconnect. Full settings: M8. */
export function ConnectionSection() {
  const auth = useAuthStore((s) => s.status);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const connected = isConnected(auth);

  const test = async () => {
    setStatus({ kind: "busy" });
    try {
      const { count } = await authTestConnection();
      setStatus({ kind: "ok", text: count === 0 ? "Connected, but no pages are shared with the integration yet." : `Connected. ${count} pages and databases shared.` });
    } catch (e) {
      setStatus({ kind: "error", text: errorMessage(e, "Could not connect.") });
    }
  };
  const save = async () => {
    const t = token.trim();
    if (t === "") return;
    setStatus({ kind: "busy" });
    try {
      await authSaveToken(t);
      setToken("");
      await useAuthStore.getState().hydrate();
      await test();
    } catch (e) {
      setStatus({ kind: "error", text: errorMessage(e, "Could not save the token.") });
    }
  };
  const disconnect = async () => {
    await authDisconnect();
    await useAuthStore.getState().hydrate();
    setStatus({ kind: "idle" });
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.h}>Connect to Notion</h2>
      <p className={styles.hint}>
        Create an internal integration in Notion, share your pages with it, and paste its token here. The token stays in Windows Credential Manager.
      </p>
      <label className={styles.field}>
        <span>{connected ? "Replace token" : "Integration token"}</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="ntn_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
        />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={token.trim() === "" || status.kind === "busy"} onClick={() => void save()}>
          Save token
        </button>
        <button type="button" className={styles.secondary} disabled={!connected || status.kind === "busy"} onClick={() => void test()}>
          Test connection
        </button>
        {connected && (
          <button type="button" className={styles.secondary} onClick={() => void disconnect()}>
            Disconnect
          </button>
        )}
      </div>
      <p role="status" className={status.kind === "error" ? styles.error : styles.hint}>
        {status.kind === "busy" ? "Testing…" : status.kind === "ok" || status.kind === "error" ? status.text : connected ? "Connected." : "Not connected."}
      </p>
    </section>
  );
}
