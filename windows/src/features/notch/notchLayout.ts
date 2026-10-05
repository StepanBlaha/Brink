import {
  type NotchEdge,
  type Rect,
  type Size,
  bodyRect,
  boundingRect,
  centerAlong,
  insetRect,
  maxLength,
  rectMidX,
  rectMidY,
} from "./notchGeometry";
import type { NotchPhase } from "./phaseMachine";
import {
  HOT_ZONE_PADDING,
  type Metrics,
  type NotchScale,
  type PillStyle,
  expandedMetrics,
  restingMetrics,
  stripMetrics,
} from "../../theme/notchMetrics";

/** Everything geometric the notch needs. Port of NotchLayout.swift. */
export interface NotchLayout {
  edge: NotchEdge;
  windowSize: Size;
  pinCount: number;
  expandedSize: Size;
  /** Window-local position along the edge. */
  anchor: number;
  /** Side edges only: where the expanded panel is centered. */
  expandedCenter: number;
  pillStyle: PillStyle;
  scale: NotchScale;
  fontScale: number;
}

export function metricsFor(l: NotchLayout, phase: NotchPhase): Metrics {
  if (phase === "resting") return restingMetrics(l.edge, l.pillStyle, l.scale);
  if (phase === "strip") return stripMetrics(l.pinCount, l.scale);
  return expandedMetrics(l.edge, l.expandedSize, l.scale);
}

export function centerFor(l: NotchLayout, phase: NotchPhase, m: Metrics = metricsFor(l, phase)): number {
  if (phase === "expanded" && l.edge !== "top") return l.expandedCenter;
  return centerAlong(l.anchor, false, m.length);
}

export function bodyRectFor(l: NotchLayout, phase: NotchPhase): Rect {
  const m = metricsFor(l, phase);
  return bodyRect(l.edge, l.windowSize, m.depth, m.length, centerFor(l, phase, m));
}

export function boundingRectFor(l: NotchLayout, phase: NotchPhase, m: Metrics = metricsFor(l, phase)): Rect {
  return boundingRect(
    l.edge,
    l.windowSize,
    Math.max(m.depth, m.corner),
    m.length,
    m.flare,
    centerFor(l, phase, m),
  );
}

/** Bounding rect plus hover padding. Resting always uses the classic Line pill. */
export function hotRect(l: NotchLayout, phase: NotchPhase): Rect {
  const m = phase === "resting" ? restingMetrics(l.edge, "line", l.scale) : metricsFor(l, phase);
  return insetRect(boundingRectFor(l, phase, m), -HOT_ZONE_PADDING, -HOT_ZONE_PADDING);
}

/** Largest expanded panel (screen terms) the window can hold. */
export function maxPanelSize(l: NotchLayout): Size {
  const sideways = l.edge !== "top";
  const depthRoom = sideways ? l.windowSize.width : l.windowSize.height;
  const flare = l.scale.expandedFlare;
  const lengthRoom = sideways
    ? maxLength(l.windowSize.height, l.windowSize.height / 2, false, flare)
    : maxLength(l.windowSize.width, l.anchor, false, flare);
  return sideways ? { width: depthRoom, height: lengthRoom } : { width: lengthRoom, height: depthRoom };
}

/** Clamp the clicked icon's midpoint so the expanded body and flares stay in the window. */
export function clampedExpandedCenter(l: NotchLayout, iconMid: number): number {
  const m = expandedMetrics(l.edge, l.expandedSize, l.scale);
  const half = m.length / 2 + m.flare + 8;
  if (l.windowSize.height <= 2 * half) return l.windowSize.height / 2;
  return Math.min(Math.max(iconMid, half), l.windowSize.height - half);
}

export function peekHeight(itemCount: number, fontScale: number): number {
  return (44 + itemCount * 20) * fontScale;
}

/** Window-space rect of the hover-peek card. `icon` is the hovered icon's rect. */
export function peekRect(l: NotchLayout, icon: Rect, itemCount: number): Rect {
  const stripDepth = l.scale.stripDepth;
  const height = peekHeight(itemCount, l.fontScale);
  const w = l.windowSize.width;
  if (l.edge === "top") {
    const width = Math.min(220 * l.scale.s, w - 12);
    const x = Math.min(Math.max(rectMidX(icon) - width / 2, 4), Math.max(w - width - 4, 4));
    return { x, y: stripDepth + 8, width, height };
  }
  const width = Math.min(220 * l.scale.s, w - stripDepth - 12);
  const x = l.edge === "right" ? w - stripDepth - 8 - width : stripDepth + 8;
  const y = Math.min(Math.max(rectMidY(icon) - height / 2, 4), Math.max(l.windowSize.height - height - 4, 4));
  return { x, y, width, height };
}
