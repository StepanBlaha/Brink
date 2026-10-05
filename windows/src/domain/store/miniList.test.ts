import { describe, expect, it } from "vitest";
import { miniListSections, statusTitle, TickThrottle, totalOpen, trayTooltip } from "./miniList";
import type { Pin, PinGroup } from "./pin";

const pin = (id: string, order: number, groupId?: string): Pin => ({
  id, notionId: id, kind: "page", title: id, icon: { none: {} }, order, ...(groupId ? { groupId } : {}),
});
const sum = (n: number) => ({ openCount: n });

describe("MiniList", () => {
  it("sorts by order and counts", () => {
    const s = miniListSections([pin("b", 2), pin("a", 1)], { a: sum(3) }, []);
    expect(s.map((x) => x.pinID)).toEqual(["a", "b"]);
    expect(s.map((x) => x.openCount)).toEqual([3, 0]);
  });
  it("filters by the active group, falling back to all", () => {
    const g: PinGroup = { id: "g", name: "G", order: 0 };
    const pins = [pin("a", 0, "g"), pin("b", 1)];
    expect(miniListSections(pins, {}, [g], "g").map((x) => x.pinID)).toEqual(["a"]);
    expect(miniListSections(pins, {}, [g], "gone")).toHaveLength(2);
  });
  it("totals and titles", () => {
    expect(totalOpen([pin("a", 0), pin("b", 1)], { a: sum(2), b: sum(5) })).toBe(7);
    expect(statusTitle(7, true)).toBe("7");
    expect(statusTitle(0, true)).toBe("");
    expect(statusTitle(7, false)).toBe("");
    expect(statusTitle(250, true)).toBe("99+");
    expect(trayTooltip(7, true)).toBe("Brink · 7 open");
    expect(trayTooltip(7, false)).toBe("Brink");
  });
  it("tick throttle", () => {
    const t = new TickThrottle(80);
    expect(t.allow(1000)).toBe(true);
    expect(t.allow(1050)).toBe(false);
    expect(t.allow(1090)).toBe(true);
    expect(t.allow(1100)).toBe(false);
  });
});
