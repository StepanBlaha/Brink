import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Pin } from "../../domain/store/pin";
import { iconDisplayFor } from "./pinItems";
import { PinIcon } from "./PinIcon";

const base: Pin = { id: "p", notionId: "n", kind: "page", title: "garden", icon: { none: {} }, order: 0 };
afterEach(cleanup);

describe("custom symbol icons", () => {
  it("a Lucide name and a Mac SF Symbol name both render an svg", () => {
    for (const name of ["star", "checkmark.circle.fill"]) {
      const kind = name.includes(".") ? "sfSymbol" : "lucide";
      const display = iconDisplayFor({ ...base, customIcon: { kind, name, colorHex: 0xff375f } });
      expect(display.kind).toBe("symbol");
      const { container, unmount } = render(<PinIcon icon={display} />);
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("an unknown symbol falls back to the title's first letter in the chosen color", () => {
    const display = iconDisplayFor({ ...base, customIcon: { kind: "sfSymbol", name: "no.such.symbol", colorHex: 0x32d74b } });
    expect(display).toEqual({ kind: "letter", text: "G", colorHex: 0x32d74b });
  });
});
