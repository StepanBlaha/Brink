import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../ipc/types";

const handlers = new Map<string, (payload: unknown) => void>();
const commands = vi.hoisted(() => ({
  pinsGet: vi.fn(),
  groupsGet: vi.fn(),
  settingsGet: vi.fn(),
  settingsSet: vi.fn(),
  authStatus: vi.fn(),
  queuePendingCount: vi.fn(),
}));

vi.mock("../ipc/commands", () => commands);
vi.mock("../ipc/events", async (orig) => ({
  ...(await orig<typeof import("../ipc/events")>()),
  on: vi.fn((event: string, handler: (p: unknown) => void) => {
    handlers.set(event, handler);
    return Promise.resolve(() => handlers.delete(event));
  }),
}));

import { hydrateAll, initState } from "./bridge";
import { useAuthStore } from "./authStore";
import { useGroupsStore } from "./groupsStore";
import { usePinsStore } from "./pinsStore";
import { useQueueStore } from "./queueStore";
import { useSettingsStore } from "./settingsStore";

const pin = { id: "p1", notionId: "n1", kind: "page" as const, title: "Tasks", icon: { none: {} }, order: 0 };

beforeEach(() => {
  handlers.clear();
  vi.clearAllMocks();
  commands.pinsGet.mockResolvedValue([pin]);
  commands.groupsGet.mockResolvedValue([{ id: "g1", name: "Work", order: 0 }]);
  commands.settingsGet.mockResolvedValue({ ...defaultSettings, dockEdge: "left" });
  commands.authStatus.mockResolvedValue({ kind: "internal" });
  commands.queuePendingCount.mockResolvedValue(2);
});

describe("state stores", () => {
  it("hydrateAll fills every store from commands", async () => {
    await hydrateAll();
    expect(usePinsStore.getState().pins).toEqual([pin]);
    expect(useGroupsStore.getState().groups[0]?.name).toBe("Work");
    expect(useSettingsStore.getState().settings.dockEdge).toBe("left");
    expect(useAuthStore.getState().status).toEqual({ kind: "internal" });
    expect(useQueueStore.getState().pending).toBe(2);
    expect(usePinsStore.getState().hydrated).toBe(true);
  });

  it("bridge subscribes to all five Rust events and applies payloads", async () => {
    const stop = await initState();
    expect([...handlers.keys()].sort()).toEqual(
      ["auth://changed", "groups://changed", "pins://changed", "queue://changed", "settings://changed"],
    );
    handlers.get("queue://changed")!({ pending: 5, lastError: "Offline" });
    expect(useQueueStore.getState()).toMatchObject({ pending: 5, lastError: "Offline" });
    handlers.get("settings://changed")!({ ...defaultSettings, pillStyle: "dot", activeGroupID: "" });
    expect(useSettingsStore.getState().settings.pillStyle).toBe("dot");
    expect(useSettingsStore.getState().settings.activeGroupID).toBeUndefined();
    handlers.get("pins://changed")!([{ ...pin, id: "p2", order: 1 }, pin]);
    expect(usePinsStore.getState().pins.map((p) => p.id)).toEqual(["p1", "p2"]);
    stop();
    expect(handlers.size).toBe(0);
  });

  it("a payload-less event refetches", async () => {
    await initState();
    commands.pinsGet.mockResolvedValue([]);
    handlers.get("pins://changed")!(null);
    await vi.waitFor(() => expect(usePinsStore.getState().pins).toEqual([]));
    commands.authStatus.mockResolvedValue({ kind: null });
    handlers.get("auth://changed")!(undefined);
    await vi.waitFor(() => expect(useAuthStore.getState().status).toEqual({ kind: null }));
  });

  it("settings update stores the whole object returned by Rust", async () => {
    commands.settingsSet.mockResolvedValue({ ...defaultSettings, soundsEnabled: false });
    await useSettingsStore.getState().update({ soundsEnabled: false });
    expect(commands.settingsSet).toHaveBeenCalledWith({ soundsEnabled: false });
    expect(useSettingsStore.getState().settings.soundsEnabled).toBe(false);
  });
});
