import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeBlocks, blockPlainText } from "./block";
import { decodeDataSourceSchema, doneStatusOptionNames } from "./dataSourceSchema";
import { decodeQueryPage } from "./row";
import { decodeSearchResults } from "./searchResult";

const fixture = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "fixtures", name), "utf8"));

describe("Decoding", () => {
  it("search results decode pages and data sources", () => {
    const results = decodeSearchResults(fixture("search.json"));
    expect(results.length).toBe(2);
    const page = results[0]!;
    expect(page.kind).toBe("page");
    expect(page.title).toBe("My Task List");
    expect(page.icon).toEqual({ type: "emoji", emoji: "\u{1F4DD}" });
    const ds = results[1]!;
    expect(ds.kind).toBe("dataSource");
    expect(ds.title).toBe("Tasks");
    expect(ds.icon).toEqual({ type: "external", url: "https://example.com/icon.png" });
  });

  it("data source schema decodes properties, select and status options", () => {
    const schema = decodeDataSourceSchema(fixture("data-source-schema.json"));
    expect(schema.id).toBe("ds-1");
    expect(schema.name).toBe("Tasks");
    expect(schema.properties.length).toBe(5);
    expect(schema.properties.map((p) => p.name)).toEqual(["Done", "Due", "Name", "Priority", "Status"]);
    const status = schema.properties.find((p) => p.name === "Status")!;
    expect(status.type).toBe("status");
    expect(status.statusOptions!.map((o) => o.name).sort()).toEqual(["Done", "Not started"]);
    const priority = schema.properties.find((p) => p.name === "Priority")!;
    expect(priority.selectOptions!.map((o) => o.name).sort()).toEqual(["High", "Low"]);
    expect(schema.properties.find((p) => p.name === "Done")!.type).toBe("checkbox");
  });

  it("status groups infer the done option, falling back to name matching when absent", () => {
    const schema = decodeDataSourceSchema(fixture("data-source-schema.json"));
    const status = schema.properties.find((p) => p.name === "Status")!;
    expect(doneStatusOptionNames(status)).toEqual(["Done"]);

    const grouped = {
      id: "grp-ds",
      name: "Grouped",
      properties: {
        Status: {
          id: "grp",
          name: "Status",
          type: "status",
          status: {
            options: [
              { id: "opt-1", name: "Backlog", color: "default" },
              { id: "opt-2", name: "Shipped", color: "green" },
            ],
            groups: [
              { name: "To-do", option_ids: ["opt-1"] },
              { name: "Complete", option_ids: ["opt-2"] },
            ],
          },
        },
      },
    };
    const groupedStatus = decodeDataSourceSchema(grouped).properties.find((p) => p.name === "Status")!;
    expect(doneStatusOptionNames(groupedStatus)).toEqual(["Shipped"]);
  });

  it("query rows decode title, checkbox, status and date, with pagination cursor", () => {
    const page1 = decodeQueryPage(fixture("query-page1.json"));
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe("cursor-2");
    const row = page1.rows[0]!;
    expect(row.title).toBe("Buy milk");
    expect(row.properties["Done"]).toEqual({ type: "checkbox", checkbox: false });
    expect(row.properties["Status"]).toEqual({ type: "status", status: { name: "Not started" } });
    expect(row.properties["Due"]).toEqual({ type: "date", date: { start: "2026-10-01" } });

    const page2 = decodeQueryPage(fixture("query-page2.json"));
    expect(page2.hasMore).toBe(false);
    const row2 = page2.rows[0]!;
    expect(row2.properties["Done"]).toEqual({ type: "checkbox", checkbox: true });
    expect(row2.icon).toEqual({ type: "emoji", emoji: "✅" });
  });

  it("block children decode known types and mark unsupported ones", () => {
    const blocks = decodeBlocks((fixture("blocks-children.json") as { results: unknown }).results);
    expect(blocks.length).toBe(4);
    expect(blocks[0]!.type).toEqual({ kind: "paragraph" });
    expect(blockPlainText(blocks[0]!)).toBe("Hello world");
    expect(blocks[1]!.type).toEqual({ kind: "toDo", checked: true });
    expect(blockPlainText(blocks[1]!)).toBe("Buy milk");
    expect(blocks[2]!.type).toEqual({ kind: "heading1" });
    expect(blocks[3]!.type).toEqual({ kind: "unsupported", apiType: "embed" });
  });
});
