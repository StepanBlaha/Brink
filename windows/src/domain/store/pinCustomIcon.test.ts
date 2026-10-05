import { describe, expect, it } from "vitest";
import { decodePin, decodePins, encodePin, encodePins, type CustomIcon, type Pin } from "./pin";

const emoji = (e: string) => ({ emoji: { _0: e } });

/** Same trick as the Swift suite: a Pin without customIcon encodes exactly like an old file. */
function legacyPinJSON(id: string, title: string, order: number): string {
  const pin: Pin = { id, notionId: `notion-${id}`, kind: "page", title, icon: emoji("\u{1F4DD}"), order };
  const json = JSON.stringify(encodePin(pin));
  expect(json).not.toContain("customIcon");
  return json;
}

describe("Pin custom icon", () => {
  it("PinStore decodes an old pins.json (no customIcon field) with customIcon == nil", () => {
    const pins = decodePins(JSON.parse(`[${legacyPinJSON("pin-1", "Tasks", 0)}]`));
    const pin = pins[0]!;
    expect(pin.id).toBe("pin-1");
    expect(pin.title).toBe("Tasks");
    expect(pin.customIcon).toBeUndefined();
  });

  it("Pin itself decodes legacy JSON (no customIcon key) with customIcon defaulting to nil", () => {
    const pin = decodePin(JSON.parse(legacyPinJSON("pin-2", "Backlog", 1)));
    expect(pin.customIcon).toBeUndefined();
    expect(pin.title).toBe("Backlog");
  });

  it("CustomIcon round-trips through Codable for every case", () => {
    const cases: CustomIcon[] = [
      { kind: "emoji", value: "\u{1F525}" },
      { kind: "sfSymbol", name: "star.fill", colorHex: 0x0a84ff },
      { kind: "letter", value: "AB", colorHex: 0xff453a },
      { kind: "lucide", name: "star", colorHex: 0x32d74b },
    ];
    for (const original of cases) {
      const pin: Pin = { id: "p", notionId: "n", kind: "page", title: "T", icon: emoji("x"), order: 0, customIcon: original };
      const decoded = decodePin(JSON.parse(JSON.stringify(encodePin(pin))));
      expect(decoded.customIcon).toEqual(original);
    }
  });

  it("Pin with a customIcon round-trips through Codable", () => {
    const pin: Pin = {
      id: "p3", notionId: "notion-3", kind: "page", title: "Reading list", icon: emoji("\u{1F4DA}"), order: 2,
      customIcon: { kind: "letter", value: "R", colorHex: 0x32d74b },
    };
    const decoded = decodePin(JSON.parse(JSON.stringify(encodePin(pin))));
    expect(decoded).toEqual(pin);
    expect(decoded.customIcon).toEqual({ kind: "letter", value: "R", colorHex: 0x32d74b });
  });

  it("encodes Swift synthesized icon shapes and omits nil optionals", () => {
    const pin: Pin = { id: "a", notionId: "n", kind: "dataSource", title: "T", icon: { url: { _0: "https://x/y.png" } }, order: 0 };
    expect(encodePin(pin)).toEqual({ id: "a", notionId: "n", kind: "dataSource", title: "T", icon: { url: { _0: "https://x/y.png" } }, order: 0 });
    expect(encodePins([{ ...pin, icon: { none: {} } }])[0]!["icon"]).toEqual({ none: {} });
  });

  it("decodes a full database config with filters and sorts", () => {
    const json = {
      id: "p", notionId: "n", kind: "dataSource", title: "DB", icon: { none: {} }, order: 1, groupId: "g",
      config: {
        doneProperty: "Status", doneKind: "status", doneValue: "Done", dateProperty: "Due", showDone: true, viewName: "Inbox",
        filters: [{ id: "f", property: "Name", op: "titleContains", textValue: "x" }],
        sorts: [{ id: "s", property: "Due", ascending: true }],
      },
    };
    const pin = decodePin(json);
    expect(pin.groupId).toBe("g");
    expect(pin.config?.filters?.[0]?.op).toBe("titleContains");
    expect(JSON.parse(JSON.stringify(encodePin(pin)))).toEqual(json);
  });

  it("a corrupt pins file decodes to empty", () => {
    expect(decodePins({ nope: 1 })).toEqual([]);
    expect(decodePins([{ id: 1 }])).toEqual([]);
  });
});
