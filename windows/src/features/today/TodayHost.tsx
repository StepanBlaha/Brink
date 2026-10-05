import { useCallback } from "react";
import { itemActions, sound, summaryService } from "../../services/hub";
import { usePinsStore } from "../../state/pinsStore";
import { TodayView } from "./TodayView";
import { useTodayModel } from "./useToday";

/** The Today panel wired to the hub services (tick sound, item actions, summary refresh). */
export function TodayHost({ reduce }: { reduce: boolean }) {
  const hasDatabasePins = usePinsStore((s) => s.pins.some((p) => p.kind === "dataSource"));
  const model = useTodayModel({
    tick: () => void sound.tick(),
    markDone: (p, i) => itemActions.markDone(p, i),
    snooze: (item, o) => itemActions.snooze(item, o),
  });
  const refresh = useCallback(() => summaryService.refreshAll(0.1), []);
  return <TodayView model={model} hasDatabasePins={hasDatabasePins} reduce={reduce} refresh={refresh} />;
}
