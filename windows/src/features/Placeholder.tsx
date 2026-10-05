import { useEffect, useState } from "react";
import { appVersion } from "../ipc/commands";
import styles from "./placeholder.module.css";

export function Placeholder({ name }: { name: string }) {
  const [version, setVersion] = useState("");
  useEffect(() => {
    appVersion()
      .then((v) => setVersion(v.marketing))
      .catch(() => setVersion(""));
  }, []);
  return (
    <div className={styles.root} data-window={name}>
      <strong>Brink</strong>
      <span>{name}</span>
      {version && <small>{version}</small>}
    </div>
  );
}
