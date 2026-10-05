import { afterEach, describe, expect, it, vi } from "vitest";
import { clickMatching, pressKey } from "./domEnv";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("director DOM driver", () => {
  it("clicks the control inside the row whose text matches", () => {
    document.body.innerHTML = `
      <div data-testid="db-row"><button role="checkbox" id="a"></button><span>Polish onboarding</span></div>
      <div data-testid="db-row"><button role="checkbox" id="b"></button><span>Fix sync after sleep</span></div>`;
    const hit = vi.fn();
    document.getElementById("b")!.addEventListener("click", hit);
    document.getElementById("a")!.addEventListener("click", () => hit("wrong"));
    expect(clickMatching(document, '[role="checkbox"]', "Fix sync")).toBe(true);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(hit.mock.calls[0]![0]).toBeInstanceOf(MouseEvent);
  });

  it("matches the peek row by its aria label and reports a miss", () => {
    document.body.innerHTML = `<div data-testid="peek"><button aria-label="Mark done: Oat milk"></button></div>`;
    expect(clickMatching(document, '[aria-label^="Mark done"]', "Oat milk")).toBe(true);
    expect(clickMatching(document, '[aria-label^="Mark done"]', "Lemons")).toBe(false);
    expect(clickMatching(document, ".nope")).toBe(false);
  });

  it("presses keys on the focused element with modifiers", () => {
    document.body.innerHTML = `<input id="i" />`;
    const input = document.getElementById("i") as HTMLInputElement;
    input.focus();
    const seen: string[] = [];
    input.addEventListener("keydown", (e) => seen.push(`${e.ctrlKey ? "ctrl+" : ""}${e.key}`));
    pressKey("f", "ctrl");
    pressKey("Enter");
    expect(seen).toEqual(["ctrl+f", "Enter"]);
  });
});
