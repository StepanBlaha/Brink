import type { CSSProperties } from "react";
import type { NotchEdge, Rect } from "./notchGeometry";
import type { ResizeHandle } from "./useResize";

const EDGE = 6;
const CORNER = 18;

interface Props {
  edge: NotchEdge;
  /** Expanded body rect, window-local. */
  rect: Rect;
  onBegin: (h: ResizeHandle, e: React.PointerEvent) => void;
  onReset: () => void;
}

/** Frames of the far edge strip and the two far corners (ResizeGrips.swift). */
export function gripFrames(edge: NotchEdge, r: Rect): Record<ResizeHandle, Rect> {
  const right = r.x + r.width;
  const bottom = r.y + r.height;
  if (edge === "right") {
    return {
      farEdge: { x: r.x, y: r.y + CORNER, width: EDGE, height: r.height - 2 * CORNER },
      cornerA: { x: r.x, y: r.y, width: CORNER, height: CORNER },
      cornerB: { x: r.x, y: bottom - CORNER, width: CORNER, height: CORNER },
    };
  }
  if (edge === "left") {
    return {
      farEdge: { x: right - EDGE, y: r.y + CORNER, width: EDGE, height: r.height - 2 * CORNER },
      cornerA: { x: right - CORNER, y: r.y, width: CORNER, height: CORNER },
      cornerB: { x: right - CORNER, y: bottom - CORNER, width: CORNER, height: CORNER },
    };
  }
  return {
    farEdge: { x: r.x + CORNER, y: bottom - EDGE, width: r.width - 2 * CORNER, height: EDGE },
    cornerA: { x: r.x, y: bottom - CORNER, width: CORNER, height: CORNER },
    cornerB: { x: right - CORNER, y: bottom - CORNER, width: CORNER, height: CORNER },
  };
}

const cursorFor = (edge: NotchEdge, h: ResizeHandle): string => {
  if (h === "farEdge") return edge === "top" ? "ns-resize" : "ew-resize";
  const nwse = edge === "right" ? h === "cornerA" : h === "cornerB";
  return nwse ? "nwse-resize" : "nesw-resize";
};

/** Invisible hit areas on the expanded panel's far edge (6 px) and far corners (18 px). */
export function ResizeGrips({ edge, rect, onBegin, onReset }: Props) {
  const frames = gripFrames(edge, rect);
  return (
    <>
      {(Object.keys(frames) as ResizeHandle[]).map((h) => {
        const f = frames[h];
        const style: CSSProperties = {
          position: "absolute", left: f.x, top: f.y, width: Math.max(f.width, 1), height: Math.max(f.height, 1),
          cursor: cursorFor(edge, h), touchAction: "none", zIndex: 5,
        };
        return (
          <div key={h} data-grip={h} style={style} onPointerDown={(e) => onBegin(h, e)} onDoubleClick={onReset} />
        );
      })}
    </>
  );
}
