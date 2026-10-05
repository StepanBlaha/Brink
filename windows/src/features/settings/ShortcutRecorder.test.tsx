import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const suspend = vi.hoisted(() => vi.fn());
vi.mock("../../ipc/hotkeysIpc", () => ({ hotkeysSuspend: suspend }));

import { ShortcutRecorder } from "./ShortcutRecorder";
import type { HotkeyAction } from "../../domain/store/hotkeys";

beforeEach(() => suspend.mockReset());
afterEach(cleanup);

function setup(action: HotkeyAction = "quickCapture", accelerator = "Alt+Shift+Space") {
  const onCommit = vi.fn();
  const onError = vi.fn();
  const view = render(<ShortcutRecorder action={action} accelerator={accelerator} label="Field" error={null} onCommit={onCommit} onError={onError} />);
  const button = screen.getByLabelText("Field");
  return { onCommit, onError, button, view };
}

describe("ShortcutRecorder", () => {
  it("records a combo, suspends while recording and resumes after", () => {
    const { button, onCommit } = setup();
    expect(button.textContent).toBe("Alt+Shift+Space");
    fireEvent.click(button);
    expect(button.textContent).toBe("Press keys…");
    expect(suspend).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(button, { code: "AltLeft", altKey: true });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { code: "KeyK", ctrlKey: true, altKey: true });
    expect(onCommit).toHaveBeenCalledWith({ ctrl: true, alt: true, shift: false, meta: false, key: "K" });
    expect(suspend).toHaveBeenLastCalledWith(false);
    expect(button.textContent).toBe("Alt+Shift+Space");
  });

  it("Esc cancels without committing", () => {
    const { button, onCommit } = setup();
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(button.textContent).toBe("Alt+Shift+Space");
    expect(suspend.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it("Enter and Backspace are ordinary keys", () => {
    const { button, onCommit } = setup();
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "Enter", altKey: true });
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter", alt: true }));
  });

  it("reports validation errors and keeps recording", () => {
    const { button, onCommit, onError } = setup();
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "KeyK", shiftKey: true });
    expect(onError).toHaveBeenLastCalledWith("Use at least Ctrl or Alt.");
    fireEvent.keyDown(button, { code: "KeyV", metaKey: true, altKey: true });
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("Windows key"));
    fireEvent.keyDown(button, { code: "Tab", altKey: true });
    expect(onError).toHaveBeenLastCalledWith("Alt+Tab is reserved by Windows.");
    expect(onCommit).not.toHaveBeenCalled();
    expect(button.textContent).toBe("Press keys…");
  });

  it("openPinN stores modifiers only and needs a digit", () => {
    const { button, onCommit, onError } = setup("openPinN", "Alt");
    expect(button.textContent).toBe("Alt+1–9");
    fireEvent.click(button);
    fireEvent.keyDown(button, { code: "KeyA", altKey: true });
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("digit"));
    fireEvent.keyDown(button, { code: "Digit4", ctrlKey: true, altKey: true });
    expect(onCommit).toHaveBeenCalledWith({ ctrl: true, alt: true, shift: false, meta: false, key: "" });
  });

  it("resumes hotkeys on unmount while recording", () => {
    const { button, view } = setup();
    fireEvent.click(button);
    view.unmount();
    expect(suspend).toHaveBeenLastCalledWith(false);
  });
});
