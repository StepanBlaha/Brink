import { useMemo, useState } from "react";
import { notionRetrieveDataSource } from "../../ipc/commands";
import type { SearchResult } from "../../domain/notion/searchResult";
import { ignore } from "../../state/ignore";
import { usePinsStore } from "../../state/pinsStore";
import { DatabaseSetup } from "./DatabaseSetup";
import { baseTitle, databaseToPin, pageToPin, retitled } from "./pinning";
import { PinSearch } from "./PinSearch";

interface Props {
  /** Edit View…: the stored database pin whose config is edited. */
  editPinId?: string | undefined;
  /** Leaves the flow and collapses the panel. */
  onClose: () => void;
}

/** The notch's add-a-pin flow (search, then database setup) and the Edit View… flow. */
export function AddFlow({ editPinId, onClose }: Props) {
  const pins = usePinsStore((s) => s.pins);
  const add = usePinsStore((s) => s.add);
  const update = usePinsStore((s) => s.update);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const pinnedIds = useMemo(() => new Set(pins.map((p) => p.notionId)), [pins]);

  const editing = editPinId ? pins.find((p) => p.id === editPinId && p.kind === "dataSource" && p.config) : undefined;
  if (editing?.config) {
    return (
      <DatabaseSetup
        title={baseTitle(editing.title)}
        loadSchema={() => notionRetrieveDataSource(editing.notionId)}
        initialConfig={editing.config}
        saveLabel="Save view"
        onCancel={onClose}
        onSave={(config) => {
          ignore(update(retitled(editing, config)));
          onClose();
        }}
      />
    );
  }
  if (picked) {
    return (
      <DatabaseSetup
        title={picked.title}
        loadSchema={() => notionRetrieveDataSource(picked.id)}
        saveLabel={pinnedIds.has(picked.id) ? "Pin as new view" : "Pin database"}
        onBack={() => setPicked(null)}
        onCancel={onClose}
        onSave={(config) => {
          ignore(add(databaseToPin(picked, config)));
          onClose();
        }}
      />
    );
  }
  return (
    <PinSearch
      pinnedIds={pinnedIds}
      onClose={onClose}
      onPick={(r) => {
        if (r.kind === "dataSource") {
          setPicked(r);
          return;
        }
        ignore(add(pageToPin(r)));
        onClose();
      }}
    />
  );
}
