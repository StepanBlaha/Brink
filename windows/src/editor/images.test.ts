import { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageEditorEngine } from "../domain/editor/engine";
import { FakeNotionServer } from "../test/fakeNotion";
import { wireImages } from "./imageWiring";
import { imageEnvOf, imageView } from "./nodeViews/ImageBlock";
import { tokenChipView } from "./nodeViews/TokenChip";
import { readImageFile } from "./plugins/images";
import { createBrinkDoc } from "./setup";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const file = (name: string, type: string, bytes: Uint8Array = png) => {
  const f = new File([bytes as BlobPart], name, { type });
  if (!f.arrayBuffer) Object.defineProperty(f, "arrayBuffer", { value: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) });
  return f;
};
const flush = () => new Promise((r) => setTimeout(r, 20));

async function setup() {
  const server = new FakeNotionServer();
  server.seed("page-1", [{ id: "p1", type: "paragraph", text: "Hello" }, { id: "p2", type: "paragraph", text: "World" }]);
  const doc = createBrinkDoc();
  const engine = new PageEditorEngine({ pageId: "page-1", api: server.api(), doc, debounceMs: 700, remoteQuietPeriodMs: 0, retryIntervalMs: 600_000 });
  const unwire = wireImages(doc, engine);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const env = imageEnvOf(doc);
  const view = new EditorView(mount, {
    state: doc.state, dispatchTransaction: doc.dispatch,
    nodeViews: { chip: tokenChipView(() => undefined), image: imageView(env) },
  });
  doc.view = view;
  await engine.load();
  server.clearLog();
  return { server, doc, engine, view, unwire };
}
const paste = (view: EditorView, files: File[]) => {
  const ev = new Event("paste", { cancelable: true }) as ClipboardEvent;
  Object.defineProperty(ev, "clipboardData", { value: { files, getData: () => "" } });
  return view.someProp("handlePaste", (f) => f(view, ev, view.state.doc.slice(0, 0))) ?? false;
};
const drop = (view: EditorView, files: File[]) => {
  const ev = new Event("drop", { cancelable: true }) as DragEvent;
  Object.defineProperty(ev, "dataTransfer", { value: { files } });
  return view.someProp("handleDrop", (f) => f(view, ev, view.state.doc.slice(0, 0), false)) ?? false;
};

afterEach(() => { document.body.innerHTML = ""; });

describe("images on ProseMirror", () => {
  it("pasting a PNG shows the chip, then the image; the sync sends 3 requests", async () => {
    const { server, doc, engine, view } = await setup();
    view.dispatch(view.state.tr); // focus-less selection stays in block 0
    expect(paste(view, [file("image.png", "image/png")])).toBe(true);
    await vi.waitFor(() => expect(doc.paragraphs().map((p) => p.kind.t)).toEqual(["paragraph", "image", "paragraph"]));
    expect(view.dom.querySelector(".img-wrap")).not.toBeNull();
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual([
      "POST /v1/file_uploads", "POST /v1/file_uploads/fu-1/send", "PATCH /v1/blocks/page-1/children",
    ]);
  });

  it("dropping a JPG file uploads with its own name; several images keep their order", async () => {
    const { server, doc, view } = await setup();
    expect(drop(view, [file("a.jpg", "image/jpeg"), file("b.png", "image/png")])).toBe(true);
    await vi.waitFor(() => expect(doc.paragraphs().filter((p) => p.kind.t === "image")).toHaveLength(2));
    const names = server.writes.filter((w) => w.description === "POST /v1/file_uploads").map((w) => (w.body as { filename: string }).filename);
    expect(names.sort()).toEqual(["a.jpg", "b.png"]);
    const srcs = doc.paragraphs().map((p) => (p.kind.t === "image" ? p.kind.source : "-"));
    expect(srcs.slice(0, 2)).toEqual(["-", "-"]); // no layout in jsdom: dropped below the last block
    expect(srcs[2]).toMatch(/^upload:/);
    expect(srcs[3]).toMatch(/^upload:/);
    // reverse insertion: b.png was uploaded first (fu-1) but sits below a.jpg (fu-2)
    expect(srcs.slice(2)).toEqual(["upload:fu-2", "upload:fu-1"]);
  });

  it("a 21 MB file is refused with the 20 MB message and nothing is uploaded", async () => {
    const { server, engine, view } = await setup();
    paste(view, [file("big.png", "image/png", new Uint8Array(21 * 1024 * 1024))]);
    await vi.waitFor(() => expect(engine.errorMessage).toBe("Image is too large (22.0 MB); the limit is 20 MB."));
    expect(server.writes).toEqual([]);
  });

  it("an expired Notion image URL is refreshed once, then shows 'Image unavailable'", async () => {
    const server = new FakeNotionServer();
    server.seed("page-1", [{ id: "im", type: "image", text: null, extra: { type: "file", file: { url: "https://files.example/im.png?sig=1", expiry_time: "2030-01-01T00:00:00.000Z" } } }]);
    const doc = createBrinkDoc();
    const api = server.api();
    const retrieve = vi.spyOn(api, "retrieveBlock");
    const engine = new PageEditorEngine({ pageId: "page-1", api, doc, retryIntervalMs: 600_000, remoteQuietPeriodMs: 0 });
    wireImages(doc, engine);
    const mount = document.body.appendChild(document.createElement("div"));
    const view = new EditorView(mount, { state: doc.state, dispatchTransaction: doc.dispatch, nodeViews: { image: imageView(imageEnvOf(doc)) } });
    doc.view = view;
    await engine.load();
    const img = view.dom.querySelector("img.img")!;
    expect(img.getAttribute("src")).toBe("https://files.example/im.png?sig=1");
    expect(view.dom.querySelector(".img-wrap")!.className).toContain("loading");
    img.dispatchEvent(new Event("error"));
    await vi.waitFor(() => expect(retrieve).toHaveBeenCalledWith("im")); // fresh URL from retrieveBlock
    img.dispatchEvent(new Event("error"));
    await flush();
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(view.dom.querySelector(".img-wrap")!.className).toContain("failed");
    expect(view.dom.querySelector(".img-note")!.textContent).toBe("Image unavailable");
    img.dispatchEvent(new Event("load"));
    expect(view.dom.querySelector(".img-wrap")!.className).toContain("ready");
  });

  it("readImageFile: passes png/jpg through, converts others to PNG, names pasted images", async () => {
    const a = await readImageFile(file("x.jpeg", "image/jpeg"), true);
    expect(a).toMatchObject({ filename: "Pasted image.jpg", contentType: "image/jpeg" });
    const b = await readImageFile(file("scan.tiff", "image/tiff"), false, async () => png);
    expect(b).toMatchObject({ filename: "scan.png", contentType: "image/png" });
    expect(await readImageFile(file("scan.bmp", "image/bmp"), false, async () => null)).toBeNull();
  });
});
