import { describe, expect, it } from "vitest";
import type { Pin } from "../../domain/store/pin";
import { LUCIDE_CATALOG, lucideFor } from "./lucideCatalog";
import { EMOJI_GROUPS, filterEmoji } from "./emojiCatalog";
import {
  insertedEmoji, letterIcon, letterText, normalizeLetters, SWATCHES, symbolIcon, withCustomIcon,
} from "./iconPickerModel";

const pin: Pin = { id: "p", notionId: "n", kind: "page", title: "groceries", icon: { none: {} }, order: 0 };

describe("icon picker model", () => {
  it("swatches skip the system accent", () => {
    expect(SWATCHES).toHaveLength(10);
    expect(SWATCHES.map((s) => s.id)).not.toContain("system");
  });
  it("letters: uppercase, two at most, title fallback", () => {
    expect(normalizeLetters("abc")).toBe("AB");
    expect(normalizeLetters(" é")).toBe("É");
    expect(letterText("", pin)).toBe("G");
    expect(letterText("x", pin)).toBe("X");
  });
  it("takes the first emoji from the panel", () => {
    expect(insertedEmoji("🧑‍💻 extra")).toBe("🧑‍💻");
    expect(insertedEmoji("  ")).toBeNull();
  });
  it("sets and clears the custom icon", () => {
    const set = withCustomIcon(pin, symbolIcon("star", 0xff375f));
    expect(set.customIcon).toEqual({ kind: "lucide", name: "star", colorHex: 0xff375f });
    expect(withCustomIcon(set, letterIcon("G", 1)).customIcon).toEqual({ kind: "letter", value: "G", colorHex: 1 });
    expect("customIcon" in withCustomIcon(set, undefined)).toBe(false);
  });
  it("every catalog symbol and every SF alias resolves to a Lucide icon", () => {
    expect(LUCIDE_CATALOG.length).toBeGreaterThanOrEqual(70);
    for (const n of LUCIDE_CATALOG) expect(lucideFor(n), n).not.toBeNull();
    expect(lucideFor("checkmark.circle")).toBe(lucideFor("circle-check"));
    expect(lucideFor("nope.unknown")).toBeNull();
  });
  it("emoji search matches keywords and drops empty groups", () => {
    expect(EMOJI_GROUPS.flatMap((g) => g.entries).length).toBeGreaterThanOrEqual(170);
    const hit = filterEmoji("  GRIN ");
    expect(hit.flatMap((g) => g.entries.map((e) => e.emoji))).toContain("😀");
    expect(filterEmoji("zzzzzz")).toEqual([]);
    expect(filterEmoji("")).toBe(EMOJI_GROUPS);
  });
});
