import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pin } from "../../domain/store/pin";
import { CaptureModel } from "./captureModel";
import { CaptureView } from "./CaptureView";

const page: Pin = { id: "p1", notionId: "n", kind: "page", title: "Inbox", icon: { none: {} }, order: 0 };
const db: Pin = {
  id: "p2", notionId: "d", kind: "dataSource", title: "Buylist", icon: { none: {} }, order: 1,
  config: { doneProperty: "Done", doneKind: "checkbox", dateProperty: "Due", showDone: false },
};

function setup(pins: Pin[], last?: string) {
  const model = new CaptureModel({
    pins: () => pins, lastPinId: () => last, setLastPinId: () => {},
    submit: async () => ({ kind: "saved" }), retrieveDataSource: async () => ({ id: "d", title: "", properties: [] }) as never,
    now: () => new Date(2026, 8, 29, 10, 0),
  });
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<CaptureView model={model} visible focusToken={0} onSubmit={onSubmit} onCancel={onCancel} />);
  return { model, onSubmit, onCancel, input: screen.getByPlaceholderText("Add to…") };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CaptureView", () => {
  it("Enter saves and closes, Ctrl+Enter saves and keeps open, Esc cancels", () => {
    const { input, onSubmit, onCancel } = setup([page]);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSubmit.mock.calls).toEqual([[false], [true]]);
    expect(onCancel).toHaveBeenCalled();
  });

  it("chip shows the pin, the database prefix, No pins yet", () => {
    setup([page, db], "p2");
    expect(screen.getAllByText("Buylist").length).toBeGreaterThan(0);
    expect(screen.getByRole("option", { name: "☰ Buylist" })).toBeTruthy();
  });

  it("shows No pins yet without pins", () => {
    setup([]);
    expect(screen.getAllByText("No pins yet").length).toBeGreaterThan(0);
  });

  it("live date chip appears for a database with a date property", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 29, 10, 0));
    const { model } = setup([db], "p2");
    fireEvent.change(screen.getByPlaceholderText("Add to…"), { target: { value: "Milk tomorrow" } });
    expect(model.text).toBe("Milk tomorrow");
    expect(screen.getByText("Tomorrow")).toBeTruthy();
  });
});
