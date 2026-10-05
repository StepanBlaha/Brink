export type DeepLink =
  | { kind: "pin"; pinId: string }
  | { kind: "capture"; text: string; url?: string; pinId?: string }
  | { kind: "oauth"; code: string; state: string }
  | { kind: "notify"; params: Record<string, string> };

/** `brink://pin/<id>`; empty ids are rejected (parity with SharedContainer.pinURL). */
export function pinURL(pinId: string): string | null {
  return pinId === "" ? null : `brink://pin/${encodeURIComponent(pinId)}`;
}

/** Routes a `brink://` URL. Unknown hosts, other schemes and malformed input give null. */
export function parseDeepLink(raw: string): DeepLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "brink:") return null;
  // WHATWG URL keeps non-special schemes opaque-ish: host is the first segment.
  const route = u.host.toLowerCase();
  const rest = u.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const q = u.searchParams;
  switch (route) {
    case "pin": {
      const id = decodeURIComponent(rest);
      return id === "" ? null : { kind: "pin", pinId: id };
    }
    case "capture": {
      const text = q.get("text") ?? "";
      const url = q.get("url") ?? undefined;
      if (text.trim() === "" && !url) return null;
      const pin = q.get("pin") ?? undefined;
      return { kind: "capture", text, ...(url ? { url } : {}), ...(pin ? { pinId: pin } : {}) };
    }
    case "oauth": {
      const code = q.get("code");
      const state = q.get("state");
      return rest === "callback" && code && state ? { kind: "oauth", code, state } : null;
    }
    case "notify":
      return { kind: "notify", params: Object.fromEntries(q.entries()) };
    default:
      return null;
  }
}
