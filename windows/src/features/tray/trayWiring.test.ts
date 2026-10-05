import { beforeEach, describe, expect, it, vi } from "vitest";

const bus = vi.hoisted(() => ({ emit: vi.fn().mockResolvedValue(undefined), listen: vi.fn().mockResolvedValue(() => undefined) }));
vi.mock("@tauri-apps/api/event", () => bus);
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { setReceivedCounts } from "../../services/summaryBridge";
import { createTrayPorts } from "./trayPorts";

beforeEach(() => bus.emit.mockClear());

describe("tray ports", () => {
  it("summaries are the counts the hub sent", () => {
    const ports = createTrayPorts();
    expect(ports.summaries()).toEqual({});
    setReceivedCounts({ a: { openCount: 7 } });
    expect(ports.summaries()["a"]?.openCount).toBe(7);
  });

  it("checking an item plays the tick through the hub and tells it the content changed", () => {
    const ports = createTrayPorts();
    ports.tick();
    expect(bus.emit).toHaveBeenCalledWith("sound://tick", null);
    ports.contentChanged("p1");
    expect(bus.emit).toHaveBeenCalledWith("pin://content-changed", { pinId: "p1" });
  });
});
