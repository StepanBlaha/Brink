import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RowPageHost } from "./RowPageHost";
import { useOpenRowPage } from "./rowPageContext";
import { RowPageRouter } from "./rowPageRouter";

function Row({ id, title }: { id: string; title: string }) {
  const open = useOpenRowPage();
  return (
    <button type="button" onClick={(e) => open?.(id, title, e.currentTarget)}>
      row {id}
    </button>
  );
}

const renderHost = (router = new RowPageRouter(() => {}), extra: { openExternal?: (id: string) => void } = {}) =>
  render(
    <RowPageHost pinId="p" router={router} renderPage={(t) => <div data-testid="page">page {t.rowId}</div>} {...extra}>
      <div data-testid="list"><Row id="r1" title="First" /><Row id="r2" title="  " /></div>
    </RowPageHost>,
  );

afterEach(cleanup);

describe("RowPageHost", () => {
  it("opens a row in place of the list and keeps the list mounted", () => {
    renderHost();
    const list = screen.getByTestId("list");
    fireEvent.click(screen.getByText("row r1"));
    expect(screen.getByTestId("page").textContent).toBe("page r1");
    expect(screen.getByRole("heading", { name: "First" })).toBeTruthy();
    expect(screen.getByTestId("list")).toBe(list);
    expect(list.closest("[inert]")).not.toBeNull();
  });

  it("empty title reads Untitled", () => {
    renderHost();
    fireEvent.click(screen.getByText("row r2"));
    expect(screen.getByRole("heading", { name: "Untitled" })).toBeTruthy();
  });

  it("moves focus to Back, then back to the originating row on close", async () => {
    renderHost();
    const row = screen.getByText("row r1");
    row.focus();
    fireEvent.click(row);
    const back = screen.getByRole("button", { name: "Back to list" });
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    expect(document.activeElement).toBe(row);
    await vi.waitFor(() => expect(screen.queryByTestId("page")).toBeNull());
  });

  it("Open in Notion uses the row id", () => {
    const openExternal = vi.fn();
    renderHost(undefined, { openExternal });
    fireEvent.click(screen.getByText("row r1"));
    fireEvent.click(screen.getByRole("button", { name: "Open in Notion" }));
    expect(openExternal).toHaveBeenCalledWith("r1");
  });

  it("takes a pending target for its pin, ignores other pins", () => {
    const router = new RowPageRouter(() => {});
    renderHost(router);
    act(() => router.open({ pinId: "other", rowId: "x", title: "X" }));
    expect(screen.queryByTestId("page")).toBeNull();
    act(() => router.open({ pinId: "p", rowId: "r9", title: "Nine" }));
    expect(screen.getByTestId("page").textContent).toBe("page r9");
    expect(router.pending).toBeNull();
  });

  it("opens a target that was pending before it mounted", () => {
    const router = new RowPageRouter(() => {});
    router.open({ pinId: "p", rowId: "r7", title: "Seven" });
    renderHost(router);
    expect(screen.getByTestId("page").textContent).toBe("page r7");
  });
});
