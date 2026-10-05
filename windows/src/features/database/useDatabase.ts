import { useSyncExternalStore } from "react";
import type { DatabaseModel, DatabaseState } from "./databaseModel";

export function useDatabase(model: DatabaseModel): DatabaseState {
  return useSyncExternalStore(model.subscribe, model.getState);
}
