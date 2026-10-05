import { useEffect, useMemo, useState } from "react";
import { aggregateToday, type TodayDigest } from "../../domain/store/todayAggregator";
import { useSummaryStore } from "../../services/summaryStore";
import { usePinsStore } from "../../state/pinsStore";
import { TodayModel, type TodayPorts } from "./todayModel";
import { visibleInterval } from "../../services/visibleInterval";

/** Everything due today or overdue across the database pins, from the live stores. */
export function currentDigest(now: Date = new Date()): TodayDigest {
  return aggregateToday(usePinsStore.getState().pins, useSummaryStore.getState().summaries, now);
}

/** Re-renders every `ms` (overdue flags of timed items change with the clock). */
export function useClock(ms: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    return visibleInterval(() => setNow(new Date()), ms);
  }, [ms]);
  return now;
}

/** The digest, recomputed when pins or summaries change. */
export function useDigest(now?: Date): TodayDigest {
  const pins = usePinsStore((s) => s.pins);
  const summaries = useSummaryStore((s) => s.summaries);
  return useMemo(() => aggregateToday(pins, summaries, now ?? new Date()), [pins, summaries, now]);
}

export function useTodayModel(ports: Omit<TodayPorts, "digest">): TodayModel {
  const [model] = useState(() => new TodayModel({ ...ports, digest: () => currentDigest() }));
  return model;
}
