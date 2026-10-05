// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFake, sprintRow } from "../features/database/fakePorts";
import { CoverStrip, coverHeight } from "./CoverStrip";
import { PageHost } from "./PageHost";
import { FakeNotionServer } from "../test/fakeNotion";

afterEach(cleanup);

describe("cover strip", () => {
  it("is 56 px high with a gradient over the bottom 55 percent, resolves through the cache, no pointer events", async () => {
    const resolve = vi.fn(() => Promise.resolve("blob:cover"));
    render(<CoverStrip cover={{ url: "https://x/c.png?sig=1", expires: true }} pageId="p" resolve={resolve} />);
    const strip = screen.getByTestId("cover-strip");
    expect(coverHeight).toBe(56);
    expect(strip.style.height).toBe("56px");
    await waitFor(() => expect(strip.querySelector("img")?.getAttribute("src")).toBe("blob:cover"));
    expect(resolve).toHaveBeenCalledWith({ url: "https://x/c.png?sig=1", expires: true }, "p");
    expect(strip.getAttribute("aria-hidden")).toBe("true");
  });
  it("falls back to the plain strip when the cache has nothing", async () => {
    render(<CoverStrip cover={{ url: "u", expires: false }} pageId="p" resolve={() => Promise.resolve(null)} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("cover-strip").querySelector("img")).toBeNull();
  });
});

describe("page host with a cover and an embedded database", () => {
  it("shows the cover and mounts the compact database under a child_database chip (8 rows, Show all N)", async () => {
    const server = new FakeNotionServer();
    server.seedPage("pg", { object: "page", id: "pg", cover: { type: "external", external: { url: "https://x/c.png" } } });
    server.seed("pg", [{ id: "db1", type: "child_database", text: null, extra: { title: "Tasks" } }]);
    const fake = createFake(Array.from({ length: 11 }, (_, i) => sprintRow(`r${i}`, `Task ${i}`)));
    const { container } = render(<PageHost pageId="pg" api={server.api()} dbPorts={fake.ports} resolveCover={() => Promise.resolve("blob:c")} onOpenToken={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("cover-strip")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Show all 11")).toBeTruthy());
    const titles = [...container.querySelectorAll<HTMLInputElement>(".chip-embed input")].map((i) => i.value).filter((v) => /^Task \d+$/.test(v));
    expect(titles).toHaveLength(8);
    expect(container.querySelector(".chip.db .chip-label")?.textContent).toContain("Tasks");
  });
});
