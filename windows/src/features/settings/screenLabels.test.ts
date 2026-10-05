import { describe, expect, it } from "vitest";
import { screenLabels } from "./screenLabels";

const s = (name: string) => ({ name, frame: { x: 0, y: 0, width: 1, height: 1 } });

describe("screenLabels", () => {
  it("keeps unique names", () => expect(screenLabels([s("Dell"), s("LG")])).toEqual(["Dell", "LG"]));
  it("numbers duplicates and nameless screens", () =>
    expect(screenLabels([s("Dell"), s("Dell"), s("")])).toEqual(["Dell 1", "Dell 2", "Display 3"]));
});
