import { useEffect, useState } from "react";
import { DatabaseModel } from "./databaseModel";
import { DatabaseTaskView } from "./DatabaseTaskView";
import { ipcPorts } from "./ipcPorts";
import type { DatabasePorts } from "./ports";
import styles from "./database.module.css";

interface Props {
  databaseId: string;
  ports?: DatabasePorts;
}

/** Resolves a database placed inside a page and shows it as a compact task list. */
export function EmbeddedDatabase({ databaseId, ports = ipcPorts }: Props) {
  const [model, setModel] = useState<DatabaseModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setModel(null);
    setError(null);
    DatabaseModel.embedded(databaseId, "embedded", ports).then(
      (m) => live && setModel(m),
      (e: unknown) => live && setError(`Couldn't load database. Check your connection and try again. (${e instanceof Error ? e.message : String(e)})`),
    );
    return () => {
      live = false;
    };
  }, [databaseId, ports]);
  if (model) return <DatabaseTaskView model={model} compact pinId={`embedded-${databaseId}`} />;
  return <div className={styles.loading}>{error ?? "Loading…"}</div>;
}
