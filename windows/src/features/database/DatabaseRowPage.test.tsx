import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Row } from "../../domain/notion/row";
import { DatabaseModel } from "./databaseModel";
import { DatabaseTaskView } from "./DatabaseTaskView";
import { createFake, sprintRow, sprintSchema } from "./fakePorts";

const opened = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../ipc/commands", () => ({ openInNotion: opened }));
vi.mock("../../editor/PageHost", () => ({ PageHost: ({ pageId }: { pageId: string }) => <div data-testid="editor">editor {pageId}</div> }));
vi.mock("../../editor/ipcEngineApi", () => ({ ipcEngineApi: {}, ipcEngineCache: () => ({}) }));

async function setup(rows: Row[], config = { doneProperty: "Done", doneKind: "checkbox" as const, dateProperty: "Due", showDone: false }) {
  const fake = createFake(rows);
  const model = new DatabaseModel("ds-sprint", config, "pin-1", fake.ports, sprintSchema);
  render(<DatabaseTaskView model={model} pinId="pin-1" />);
  await waitFor(() => screen.getByRole("button", { name: /Open page Ship it/ }));
  return fake;
}

afterEach(cleanup);

describe("database row as page", () => {
  it("clicking the title opens the page with the row id, Back returns", async () => {
    await setup([sprintRow("r1", "Ship it")]);
    const title = screen.getByRole("button", { name: "Open page Ship it" });
    fireEvent.click(title);
    expect(screen.getByTestId("editor").textContent).toBe("editor r1");
    expect(screen.getByRole("heading", { name: "Ship it" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(document.activeElement).toBe(title);
  });

  it("the hover chevron opens the page too", async () => {
    await setup([sprintRow("r1", "Ship it")]);
    fireEvent.click(screen.getByTitle("Open page"));
    expect(screen.getByTestId("editor")).toBeTruthy();
  });

  it("context menu: Open page, Open in Notion, Rename, Snooze submenu", async () => {
    const fake = await setup([sprintRow("r1", "Ship it", { due: "2030-01-01" })]);
    fireEvent.contextMenu(screen.getByTestId("db-row"));
    const names = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(names).toEqual(["Open page", "Open in Notion", "Rename", "Snooze›"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in Notion" }));
    expect(opened).toHaveBeenCalledWith("r1");
    fireEvent.contextMenu(screen.getByTestId("db-row"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = await screen.findByRole("textbox", { name: "Task title" });
    fireEvent.change(input, { target: { value: "Shipped" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fake.ops.length).toBeGreaterThan(0));
  });

  it("Open page from the menu opens the page", async () => {
    await setup([sprintRow("r1", "Ship it")]);
    fireEvent.contextMenu(screen.getByTestId("db-row"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open page" }));
    expect(screen.getByTestId("editor").textContent).toBe("editor r1");
  });
});
