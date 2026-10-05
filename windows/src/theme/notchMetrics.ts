import type { NotchEdge, Size } from "../features/notch/notchGeometry";

/** Port of Theme.Notch (Theme.swift). `s` is the metrics scale of the size preset. */
export type NotchSize = "small" | "medium" | "large";
export type PillStyle = "line" | "percent" | "dot" | "hidden";

export const SIZE_SCALE: Record<NotchSize, { metrics: number; font: number }> = {
  small: { metrics: 0.85, font: 0.93 },
  medium: { metrics: 1, font: 1 },
  large: { metrics: 1.2, font: 1.1 },
};

export interface Metrics {
  depth: number;
  length: number;
  corner: number;
  flare: number;
}

export const HOT_ZONE_PADDING = 30;
export const HOVER_OUT_DELAY_MS = 350;
export const PEEK_DWELL_MS = 500;
export const PEEK_DISMISS_MS = 300;

export const PANEL_LIMITS = { minWidth: 300, maxWidth: 900, minHeight: 240 } as const;

export interface NotchScale {
  s: number;
  iconSize: number;
  iconSpacing: number;
  stripPadding: number;
  stripDepth: number;
  stripCorner: number;
  stripFlare: number;
  expandedCorner: number;
  expandedFlare: number;
}

export function notchScale(size: NotchSize): NotchScale {
  const s = SIZE_SCALE[size].metrics;
  return {
    s,
    iconSize: 28 * s,
    iconSpacing: 8 * s,
    stripPadding: 14 * s,
    stripDepth: 56 * s,
    stripCorner: 18 * s,
    stripFlare: 14 * s,
    expandedCorner: 22 * s,
    expandedFlare: 20 * s,
  };
}

export function defaultExpandedSize(edge: NotchEdge, s: number): Size {
  return edge === "top"
    ? { width: 560 * s, height: 400 * s }
    : { width: 400 * s, height: 560 * s };
}

/** `pinCount` includes the Today pin when shown. */
export function stripMetrics(pinCount: number, sc: NotchScale): Metrics {
  const icons = pinCount * sc.iconSize + Math.max(pinCount - 1, 0) * sc.iconSpacing;
  const addButton = sc.iconSpacing + sc.iconSize;
  const groupSwitcher = sc.iconSize + sc.iconSpacing + 6 * sc.s;
  return {
    depth: sc.stripDepth,
    length: sc.stripPadding * 2 + groupSwitcher + icons + addButton,
    corner: sc.stripCorner,
    flare: sc.stripFlare,
  };
}

export function expandedMetrics(edge: NotchEdge, size: Size, sc: NotchScale): Metrics {
  const sideways = edge !== "top";
  return {
    depth: sideways ? size.width : size.height,
    length: sideways ? size.height : size.width,
    corner: sc.expandedCorner,
    flare: sc.expandedFlare,
  };
}

export function restingMetrics(edge: NotchEdge, style: PillStyle, sc: NotchScale): Metrics {
  const s = sc.s;
  if (style === "percent") {
    const top = edge === "top";
    return {
      depth: (top ? 18 : 34) * s,
      length: (top ? 46 : 20) * s,
      corner: 9 * s,
      flare: 6 * s,
    };
  }
  if (style === "dot") return { depth: 8, length: 8, corner: 4, flare: 0 };
  return { depth: 8 * s, length: 80 * s, corner: 4 * s, flare: 6 * s };
}

/** PanelSizeStore clamp: width and height inside the limits and the window's room. */
export function clampPanelSize(size: Size, availW: number, maxH: number): Size {
  const w = Math.min(
    Math.max(size.width, PANEL_LIMITS.minWidth),
    Math.max(PANEL_LIMITS.minWidth, Math.min(PANEL_LIMITS.maxWidth, availW)),
  );
  const h = Math.min(Math.max(size.height, PANEL_LIMITS.minHeight), Math.max(PANEL_LIMITS.minHeight, maxH));
  return { width: w, height: h };
}
