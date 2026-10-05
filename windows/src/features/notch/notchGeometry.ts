/** Pure notch geometry. Port of NotionKit/Store/NotchGeometry.swift. Window-local, top-left origin. */
export type NotchEdge = "left" | "right" | "top";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}

export const rectMaxX = (r: Rect): number => r.x + r.width;
export const rectMaxY = (r: Rect): number => r.y + r.height;
export const rectMidX = (r: Rect): number => r.x + r.width / 2;
export const rectMidY = (r: Rect): number => r.y + r.height / 2;

export function insetRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy };
}

export function rectContains(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height;
}

export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(rectMaxX(a), rectMaxX(b)) - x,
    height: Math.max(rectMaxY(a), rectMaxY(b)) - y,
  };
}

/** The shape's body rect (no flares) inside the window. */
export function bodyRect(
  edge: NotchEdge,
  windowSize: Size,
  depth: number,
  length: number,
  center: number,
): Rect {
  switch (edge) {
    case "right":
      return { x: windowSize.width - depth, y: center - length / 2, width: depth, height: length };
    case "left":
      return { x: 0, y: center - length / 2, width: depth, height: length };
    case "top":
      return { x: center - length / 2, y: 0, width: length, height: depth };
  }
}

/** Body rect outset by the flare bulge along the screen edge. */
export function boundingRect(
  edge: NotchEdge,
  windowSize: Size,
  depth: number,
  length: number,
  flare: number,
  center: number,
): Rect {
  const body = bodyRect(edge, windowSize, depth, length, center);
  return edge === "top" ? insetRect(body, -flare, 0) : insetRect(body, 0, -flare);
}

/** Center along the edge. With `leading`, `anchor` is the shape's leading end. */
export function centerAlong(anchor: number, leading: boolean, length: number): number {
  return leading ? anchor + length / 2 : anchor;
}

/** Longest body length that fits with flares and a margin kept inside the window. */
export function maxLength(
  windowLength: number,
  anchor: number,
  leading: boolean,
  flare: number,
  margin = 8,
): number {
  if (leading) return Math.max(0, windowLength - anchor - flare - margin);
  return Math.max(0, 2 * (Math.min(anchor, windowLength - anchor) - flare - margin));
}

/**
 * Screen frame of the notch window. Side edges use `visible` (work area) and are vertically
 * centered; top uses the full `frame`, positioned so `topAnchorX` is the window midpoint.
 * Screen coordinates here have a top-left origin (Windows), unlike the AppKit original.
 */
export function windowFrame(
  edge: NotchEdge,
  frame: Rect,
  visible: Rect,
  size: Size,
  topAnchorX: number,
  topLeading = false,
  leadMargin = 30,
): Rect {
  const midY = visible.y + (visible.height - size.height) / 2;
  switch (edge) {
    case "left":
      return { x: visible.x, y: midY, ...size };
    case "right":
      return { x: rectMaxX(visible) - size.width, y: midY, ...size };
    case "top": {
      const want = topLeading ? topAnchorX - leadMargin : topAnchorX - size.width / 2;
      const x = Math.min(Math.max(want, frame.x), Math.max(frame.x, rectMaxX(frame) - size.width));
      return { x, y: frame.y, ...size };
    }
  }
}
