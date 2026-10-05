import { useEffect, useState } from "react";
import icon from "../../assets/brink-icon.png";
import { appVersion } from "../../ipc/commands";
import { openUrl } from "../../ipc/captureIpc";
import { windowOpen, type WindowName } from "../../ipc/windowsIpc";
import { WEBSITE } from "../../domain/links";
import styles from "./about.module.css";

export const TAGLINE = "Your pages, on the edge.";
export const NON_AFFILIATION = "Brink is an independent app and is not affiliated with Notion Labs, Inc.";

function Pill({ children, onClick }: { children: string; onClick: () => void }) {
  return <button type="button" className={styles.pill} onClick={onClick}>{children}</button>;
}

/** The 340x420 About window. */
export function AboutWindow() {
  const [version, setVersion] = useState<string>("");
  useEffect(() => {
    void appVersion().then((v) => setVersion(`Version ${v.marketing} (${v.build})`)).catch(() => {});
  }, []);
  const open = (name: WindowName) => () => void windowOpen(name).catch(() => {});
  return (
    <main className={styles.about}>
      <img className={styles.icon} src={icon} alt="Brink app icon" width={96} height={96} />
      <h1 className={styles.name}>Brink</h1>
      <p className={styles.tagline}>{TAGLINE}</p>
      <p className={styles.version}>{version}</p>
      <div className={styles.row}>
        <Pill onClick={() => void openUrl(WEBSITE).catch(() => {})}>Website</Pill>
        <Pill onClick={open("legal:privacy")}>Privacy</Pill>
        <Pill onClick={open("legal:terms")}>Terms</Pill>
      </div>
      <Pill onClick={open("legal:notice")}>Acknowledgements</Pill>
      <div className={styles.spacer} />
      <p className={styles.copy}>{"© 2026 Stepan Blaha"}</p>
      <p className={styles.legal}>{NON_AFFILIATION}</p>
    </main>
  );
}
