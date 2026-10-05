import { useMemo } from "react";
import type { Pin } from "../../domain/store/pin";
import { DatabaseModel } from "./databaseModel";
import { DatabaseTaskView } from "./DatabaseTaskView";
import { ipcPorts } from "./ipcPorts";
import type { DatabasePorts } from "./ports";

/** Panel body for a pinned database (`pin.kind === "dataSource"` with a saved config). */
export function DatabaseHost({ pin, ports = ipcPorts }: { pin: Pin; ports?: DatabasePorts }) {
  const model = useMemo(
    () => new DatabaseModel(pin.notionId, pin.config ?? null, pin.id, ports),
    [pin.notionId, pin.config, pin.id, ports],
  );
  return <DatabaseTaskView model={model} />;
}
