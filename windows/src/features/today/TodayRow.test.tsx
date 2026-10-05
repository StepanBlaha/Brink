import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodayItem } from "../../domain/store/todayAggregator";
import { RowPageHost } from "../database/RowPageHost";
import { RowPageRouter } from "../database/rowPageRouter";
import { TodayRow } from "./TodayRow";

const opened = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../ipc/commands", () => ({ openInNotion: opened }));
vi.mock("../../editor/PageHost", () => ({ PageHost: () => null }));
vi.mock("../../editor/ipcEngineApi", () => ({ ipcEngineApi: {}, ipcEngineCache: () => ({}) }));
afterEach(cleanup);

const item: TodayItem = { id: "row-1", pinId: "db", title: "Pay rent", due: new Date(), hasTime: false, isOverdue: false };

const mount = () =>
  render(
    <RowPageHost pinId="brink.today" router={new RowPageRouter(() => {})} renderPage={(t) => <div data-testid="page">{t.rowId}</div>}>
      <TodayRow item={item} checked={false} now={new Date()} reduce onToggle={() => {}} onSnoozeButton={() => {}} />
    </RowPageHost>,
  );

describe("TodayRow", () => {
  it("title click opens the row's page", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open page Pay rent" }));
    expect(screen.getByTestId("page").textContent).toBe("row-1");
  });

  it("context menu offers Open page and Open in Notion", () => {
    const { container } = mount();
    fireEvent.contextMenu(container.querySelector("div[class*=row]") as Element);
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Open page", "Open in Notion"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Open in Notion" }));
    expect(opened).toHaveBeenCalledWith("row-1");
  });
});
