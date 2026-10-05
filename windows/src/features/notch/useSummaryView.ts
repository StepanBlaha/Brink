import { useCallback, useMemo } from "react";
import type { PinSummary } from "../../domain/store/pinSummary";
import { aggregateToday, todaySummary } from "../../domain/store/todayAggregator";
import { useSummaryStore } from "../../services/summaryStore";
import { usePinsStore } from "../../state/pinsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { isTodayId } from "../strip/pinItems";
import { badgeCount, pillView } from "./pillModel";

/** Summaries as the notch shows them: badges, pill ratio and label, and a lookup that knows the Today pin. */
export function useSummaryView(stripIds: string[]) {
  const summaries = useSummaryStore((s) => s.summaries);
  const pins = usePinsStore((s) => s.pins);
  const settings = useSettingsStore((s) => s.settings);
  const digest = useMemo(() => aggregateToday(pins, summaries, new Date()), [pins, summaries]);
  const summaryFor = useCallback(
    (id: string): PinSummary | undefined => (isTodayId(id) ? todaySummary(digest) : summaries[id]),
    [digest, summaries],
  );
  const badges = useMemo(
    () => Object.fromEntries(stripIds.map((id) => [id, badgeCount(summaryFor(id), settings.badgeMode)])),
    [stripIds, summaryFor, settings.badgeMode],
  );
  const pill = pillView({
    mode: settings.pillProgressMode, stripIds, lastOpenedPinID: settings.lastOpenedPinID,
    asFraction: settings.pillShowsFraction, summaryFor,
  });
  return { summaryFor, badges, pill, digest };
}
