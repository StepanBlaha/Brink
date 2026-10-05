import { describe, expect, it } from "vitest";
import {
  decodePropertyValue,
  encodePropertyValue,
  propertyRequestJSON,
  type PropertyValue,
} from "./propertyValue";

describe("PropertyValue", () => {
  it("round-trips through Codable for every case", () => {
    const values: PropertyValue[] = [
      { type: "title", title: "Hello" },
      { type: "rich_text", rich_text: "Some notes" },
      { type: "checkbox", checkbox: true },
      { type: "status", status: { name: "In progress" } },
      { type: "status" },
      { type: "select", select: { name: "High" } },
      { type: "date", date: { start: "2026-01-01", end: "2026-01-05" } },
      { type: "date" },
      { type: "number", number: 42.5 },
      { type: "number" },
      { type: "unsupported", rawType: "relation" },
    ];
    for (const value of values) {
      const data = JSON.stringify(encodePropertyValue(value));
      expect(decodePropertyValue(JSON.parse(data))).toEqual(value);
    }
  });

  it("requestJSON builds the update-page-properties shape", () => {
    expect(propertyRequestJSON({ type: "checkbox", checkbox: true })).toEqual({ type: "checkbox", checkbox: true });
    expect(propertyRequestJSON({ type: "date" })).toEqual({ type: "date", date: null });
    expect(propertyRequestJSON({ type: "unsupported", rawType: "relation" })).toBeNull();
  });

  it("decodes the Notion API shape (rich text arrays, option objects)", () => {
    expect(
      decodePropertyValue({ id: "x", type: "title", title: [{ plain_text: "A" }, { plain_text: "B" }] }),
    ).toEqual({ type: "title", title: "AB" });
    expect(
      decodePropertyValue({ type: "status", status: { id: "o", name: "Done", color: "green" } }),
    ).toEqual({ type: "status", status: { name: "Done" } });
    expect(decodePropertyValue({ type: "date", date: { start: "2026-10-01", end: null } })).toEqual({
      type: "date",
      date: { start: "2026-10-01" },
    });
  });

  it("title request JSON is chunked rich text", () => {
    expect(propertyRequestJSON({ type: "title", title: "Hi" })).toEqual({
      type: "title",
      title: [{ type: "text", text: { content: "Hi" } }],
    });
  });
});
