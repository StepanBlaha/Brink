import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { renderRoute } from "../../routes";
import { withDemoBackdrop } from "./boot";
import { setDemoForTest } from "./demoFlag";

const css = readFileSync("src/features/demo/backdrop.module.css", "utf8");

afterEach(() => {
  cleanup();
  setDemoForTest({ enabled: false, baseUrl: null, script: null, markers: false });
});
const on = () => setDemoForTest({ enabled: true, baseUrl: null, script: "none", markers: false });

describe("demo backdrop", () => {
  it("is the backdrop route, with the dusk layers", () => {
    render(renderRoute("#/backdrop"));
    expect(screen.getByTestId("dusk")).toBeTruthy();
  });

  it("paints the Brand dusk gradient and light layers", () => {
    expect(css).toContain("linear-gradient(160deg, #5c6b9e, #9e85a8, #eda88f)");
    expect(css).toContain("rgba(255, 199, 153, 0.3)");
    expect(css).toContain("rgba(255, 255, 255, 0.1)");
    expect(css).toContain("rgba(0, 0, 0, 0.16)");
    expect(css).toContain("pointer-events: none");
  });

  it("is added behind the notch page only in demo mode, in a browser", () => {
    const node = <div data-testid="notch" />;
    const off = render(withDemoBackdrop("#/notch", node));
    expect(off.queryByTestId("dusk")).toBeNull();
    off.unmount();
    on();
    const demo = render(withDemoBackdrop("#/notch", node));
    expect(demo.getByTestId("dusk")).toBeTruthy();
    demo.unmount();
    const other = render(withDemoBackdrop("#/settings", node));
    expect(other.queryByTestId("dusk")).toBeNull();
  });
});
