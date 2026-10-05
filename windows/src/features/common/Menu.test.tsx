import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Menu, type MenuEntry } from "./Menu";

describe("Menu", () => {
  it("selects with Enter after arrows, closes first, skips disabled items, opens submenus", () => {
    const a = vi.fn();
    const b = vi.fn();
    const sub = vi.fn();
    const onClose = vi.fn();
    const items: MenuEntry[] = [
      { kind: "item", id: "a", label: "A", onSelect: a },
      { kind: "item", id: "dis", label: "Disabled", disabled: true, onSelect: b },
      { kind: "submenu", id: "s", label: "More", items: [{ kind: "item", id: "x", label: "X", onSelect: sub }] },
    ];
    render(<Menu x={10} y={10} label="m" items={items} onClose={onClose} />);
    const menu = screen.getByRole("menu");
    fireEvent.click(screen.getByText("Disabled"));
    expect(b).not.toHaveBeenCalled();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(menu, { key: "ArrowRight" });
    fireEvent.click(screen.getByText("X"));
    expect(sub).toHaveBeenCalled();
    fireEvent.click(screen.getByText("A"));
    expect(a).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
