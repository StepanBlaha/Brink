import { useMemo } from "react";
import { useNotchStore } from "../../state/notchStore";
import { FAKE_PINS } from "./fakePins";
import { type NotchLayout, maxPanelSize } from "./notchLayout";
import { SIZE_SCALE, clampPanelSize, defaultExpandedSize, notchScale } from "../../theme/notchMetrics";

/** Builds the layout from the window size and settings. */
export function useNotchLayout(): NotchLayout {
  const { edge, size, pill, pins } = useNotchStore((s) => s.config);
  const windowSize = useNotchStore((s) => s.windowSize);
  return useMemo(() => {
    const scale = notchScale(size);
    const base: NotchLayout = {
      edge,
      windowSize,
      pinCount: Math.min(pins, FAKE_PINS.length),
      expandedSize: { width: 0, height: 0 },
      anchor: edge === "top" ? windowSize.width / 2 : windowSize.height / 2,
      expandedCenter: windowSize.height / 2,
      pillStyle: pill,
      scale,
      fontScale: SIZE_SCALE[size].font,
    };
    const max = maxPanelSize(base);
    const expandedSize = clampPanelSize(defaultExpandedSize(edge, scale.s), max.width, max.height);
    return { ...base, expandedSize };
  }, [edge, size, pill, pins, windowSize]);
}
