import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodePendingWrite, decodePendingWrites, encodePendingWrite, swiftDateFrom, unixMsFromSwiftDate,
} from "./pendingWrite";

const dir = join(__dirname, "..", "..", "..", "fixtures", "queue-ops");
const read = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "pending-all.json");
const legacyDir = join(dir, "legacy");
const legacy = readdirSync(legacyDir).filter((f) => f.endsWith(".json") && f !== "pending-legacy.json");

describe("queue-ops fixtures", () => {
  it("has fixtures", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  for (const f of files) {
    it(`round-trips ${f}`, () => {
      const json = read(join(dir, f));
      expect(encodePendingWrite(decodePendingWrite(json))).toEqual(json);
    });
  }

  it("pending-all.json holds every fixture and round-trips", () => {
    const all = read(join(dir, "pending-all.json")) as unknown[];
    const individual = files.map((f) => read(join(dir, f)));
    expect(all).toEqual(individual.sort((a, b) => ((a as { createdAt: number }).createdAt - (b as { createdAt: number }).createdAt)));
    expect(decodePendingWrites(all).map(encodePendingWrite)).toEqual(all);
  });

  it("legacy createRow without extra decodes extra to []", () => {
    const json = read(join(legacyDir, "legacy-createRow-missing-extra.json")) as { operation: object };
    const encoded = encodePendingWrite(decodePendingWrite(json));
    expect(encoded).toEqual({ ...json, operation: { ...json.operation, extra: [] } });
  });

  it("legacy appendBlocks without position decodes to end", () => {
    const json = read(join(legacyDir, "legacy-appendBlocks-missing-position.json")) as { operation: object };
    const encoded = encodePendingWrite(decodePendingWrite(json));
    expect(encoded).toEqual({ ...json, operation: { ...json.operation, position: { end: {} } } });
  });

  it("has both legacy fixtures", () => {
    expect(legacy.length).toBe(2);
  });

  it("converts Swift dates", () => {
    expect(swiftDateFrom(978307200000)).toBe(0);
    expect(unixMsFromSwiftDate(0)).toBe(978307200000);
  });
});
