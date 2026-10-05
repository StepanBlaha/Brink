import { isObject, str, type JsonObject } from "./json";

/** A Notion icon. `custom_emoji` decodes to `external` (parity with Icon.swift). */
export type Icon =
  | { type: "emoji"; emoji: string }
  | { type: "external"; url: string }
  | { type: "file"; url: string }
  | { type: "none" };

export const noIcon: Icon = { type: "none" };

function urlOf(v: unknown): string | undefined {
  return isObject(v) ? str(v["url"]) : undefined;
}

export function decodeIcon(v: unknown): Icon {
  if (!isObject(v)) return noIcon;
  switch (str(v["type"])) {
    case "emoji": {
      const emoji = str(v["emoji"]);
      return emoji === undefined ? noIcon : { type: "emoji", emoji };
    }
    case "external": {
      const url = urlOf(v["external"]);
      return url === undefined ? noIcon : { type: "external", url };
    }
    case "file": {
      const url = urlOf(v["file"]);
      return url === undefined ? noIcon : { type: "file", url };
    }
    case "custom_emoji": {
      const url = urlOf(v["custom_emoji"]);
      return url === undefined ? noIcon : { type: "external", url };
    }
    default:
      return noIcon;
  }
}

/** Swift encoding: `.none` encodes an empty object. */
export function encodeIcon(icon: Icon): JsonObject {
  switch (icon.type) {
    case "emoji":
      return { type: "emoji", emoji: icon.emoji };
    case "external":
      return { type: "external", external: { url: icon.url } };
    case "file":
      return { type: "file", file: { url: icon.url } };
    case "none":
      return {};
  }
}
