export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A screen as far as display selection cares. `name` is `friendlyName|deviceName` on Windows. */
export interface ScreenInfo {
  name: string;
  frame: Rect;
}

export type DisplayPreference = { kind: "main" } | { kind: "mouse" } | { kind: "named"; name: string; frame: Rect };

export const zeroRect: Rect = { x: 0, y: 0, width: 0, height: 0 };

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** CGRect.contains: half-open on the max edges. */
function contains(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
}

/** Stored form: `main`, `mouse`, or `screen:<name>\t<x>,<y>,<w>,<h>`. */
export function storedDisplayPreference(p: DisplayPreference): string {
  if (p.kind === "named") {
    const f = p.frame;
    return `screen:${p.name}\t${f.x},${f.y},${f.width},${f.height}`;
  }
  return p.kind;
}

export function parseDisplayPreference(stored: string | undefined | null): DisplayPreference {
  if (stored === undefined || stored === null) return { kind: "main" };
  if (stored === "mouse") return { kind: "mouse" };
  if (stored.startsWith("screen:")) {
    const body = stored.slice("screen:".length);
    const tab = body.indexOf("\t");
    const name = tab < 0 ? body : body.slice(0, tab);
    let frame = zeroRect;
    if (tab >= 0) {
      const n = body
        .slice(tab + 1)
        .split(",")
        .filter((s) => s !== "")
        .map(Number)
        .filter((x) => Number.isFinite(x));
      if (n.length === 4) frame = { x: n[0] as number, y: n[1] as number, width: n[2] as number, height: n[3] as number };
    }
    return { kind: "named", name, frame };
  }
  return { kind: "main" };
}

/**
 * Index into `screens` the notch should use (`screens[0]` is the primary display). Named screens
 * match by name (a matching frame breaks ties), then by frame alone, then fall back to primary.
 */
export function resolveDisplay(p: DisplayPreference, screens: ScreenInfo[], mouse: Point): number | undefined {
  if (screens.length === 0) return undefined;
  switch (p.kind) {
    case "main":
      return 0;
    case "mouse": {
      const i = screens.findIndex((s) => contains(s.frame, mouse));
      return i < 0 ? 0 : i;
    }
    case "named": {
      const byName = screens.flatMap((s, i) => (s.name === p.name ? [i] : []));
      const exact = byName.find((i) => sameRect((screens[i] as ScreenInfo).frame, p.frame));
      if (exact !== undefined) return exact;
      if (byName[0] !== undefined) return byName[0];
      const byFrame = screens.findIndex((s) => sameRect(s.frame, p.frame));
      return byFrame < 0 ? 0 : byFrame;
    }
  }
}
