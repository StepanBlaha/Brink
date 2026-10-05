import { createRoot } from "react-dom/client";
import { EmbeddedDatabase } from "../features/database/EmbeddedDatabase";
import type { DatabasePorts } from "../features/database/ports";
import type { EmbedDatabase } from "./nodeViews/TokenChip";

/** Mounts M4's compact `EmbeddedDatabase` (8 rows, "Show all N") under a `child_database` chip. */
export const makeEmbedDatabase = (ports?: DatabasePorts): EmbedDatabase => (databaseId, container) => {
  const root = createRoot(container);
  root.render(<EmbeddedDatabase databaseId={databaseId} {...(ports ? { ports } : {})} />);
  return () => { queueMicrotask(() => root.unmount()); };
};
