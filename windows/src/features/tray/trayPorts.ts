import { decodeBlocks } from "../../domain/notion/block";
import { queueSubmit, notionBlockChildren, cacheLoad } from "../../ipc/commands";
import { soundTick } from "../../ipc/soundIpc";
import { announceContentChanged, receivedCounts } from "../../services/summaryBridge";
import { useAuthStore, isConnected } from "../../state/authStore";
import { useGroupsStore } from "../../state/groupsStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { DatabaseModel } from "../database/databaseModel";
import { ipcPorts } from "../database/ipcPorts";
import type { MiniPorts } from "./miniListModel";

/** Real ports over the Tauri stores/commands. Database models are kept per pin. */
export function createTrayPorts(): MiniPorts {
  const models = new Map<string, DatabaseModel>();
  return {
    pins: () => usePinsStore.getState().pins,
    groups: () => useGroupsStore.getState().groups,
    activeGroupId: () => useSettingsStore.getState().settings.activeGroupID,
    lastOpenedPinId: () => useSettingsStore.getState().settings.lastOpenedPinID,
    summaries: receivedCounts,
    hasToken: () => isConnected(useAuthStore.getState().status),
    async cachedBlocks(pinId) {
      const json = await cacheLoad(pinId, "blocks");
      return json === null ? null : decodeBlocks(json);
    },
    pageBlocks: (pin) => notionBlockChildren(pin.notionId),
    databaseModel(pin) {
      const hit = models.get(pin.id);
      if (hit) return hit;
      if (!pin.config) return null;
      const m = new DatabaseModel(pin.notionId, pin.config, pin.id, ipcPorts);
      models.set(pin.id, m);
      return m;
    },
    submit: (op) => queueSubmit(op),
    tick: soundTick,
    contentChanged: announceContentChanged,
  };
}
