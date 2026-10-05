import { describe, expect, it } from "vitest";
import { comparable } from "./engineImages";
import { K } from "../markdown/paragraphKind";
import { at, makeHarness } from "./engineHarness";
import { s } from "./plannerHelpers";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const imageSeed = (id: string) => ({
  id, type: "image", text: null,
  extra: { type: "file", file: { url: `https://files.example/${id}.png?sig=1`, expiry_time: "2030-01-01T00:00:00.000Z" } },
});
const latin1 = (b: Uint8Array): string => new TextDecoder("latin1").decode(b);

describe("ImageBlockTests (engine part)", () => {
  it("uploadThenAppend: create upload, send multipart, append file_upload image after the caret's block", async () => {
    const { server, host, engine } = makeHarness({ seed: false, debounceMs: 30 });
    server.seed("page-1", [{ id: "p1", type: "paragraph", text: "Hello" }, { id: "p2", type: "paragraph", text: "World" }]);
    await engine.load();
    server.clearLog();

    expect(await engine.insertImage(png, "shot.png", "image/png", 0)).toBe(true);
    expect(host.kinds()).toEqual([K.paragraph, K.image("upload:fu-1"), K.paragraph]);
    expect(host.text()).toBe("Hello\n￼\nWorld");

    await engine.syncNow();
    const writes = server.writes;
    expect(writes.map((w) => w.description)).toEqual([
      "POST /v1/file_uploads", "POST /v1/file_uploads/fu-1/send", "PATCH /v1/blocks/page-1/children",
    ]);
    expect(at(writes[0]!.body, "mode")).toBe("single_part");
    expect(at(writes[0]!.body, "filename")).toBe("shot.png");
    expect(at(writes[0]!.body, "content_type")).toBe("image/png");
    expect(writes[1]!.contentType?.startsWith("multipart/form-data; boundary=")).toBe(true);
    const raw = latin1(writes[1]!.rawBody!);
    expect(raw).toContain('Content-Disposition: form-data; name="file"; filename="shot.png"\r\nContent-Type: image/png\r\n\r\n');
    expect(raw).toContain(latin1(png));

    const children = at(writes[2]!.body, "children") as unknown[];
    expect(children).toHaveLength(1);
    expect(at(children, 0, "type")).toBe("image");
    expect(at(children, 0, "image", "type")).toBe("file_upload");
    expect(at(children, 0, "image", "file_upload", "id")).toBe("fu-1");
    expect(at(writes[2]!.body, "position", "after_block", "id")).toBe("p1");

    const ids = server.childIds("page-1");
    expect(ids).toHaveLength(3);
    expect([ids[0], ids[2]]).toEqual(["p1", "p2"]);
    expect(host.blockIds()[1]).toBe(ids[1]);
    const fetched = await engine.fetchDocument();
    expect(fetched[1]!.kind).toEqual(K.image("file:https://files.example/fu-1.png?X-Amz-Signature=abc"));
    server.clearLog();
    await engine.syncNow();
    expect(server.writes).toEqual([]);
  });

  it("tooLarge: a too-large image is refused before any request", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [{ id: "p1", type: "paragraph", text: "Hello" }]);
    await engine.load();
    server.clearLog();
    const ok = await engine.insertImage(new Uint8Array(20 * 1024 * 1024 + 1), "big.png", "image/png", 0);
    expect(ok).toBe(false);
    expect(server.writes).toEqual([]);
    expect(engine.errorMessage).toBe("Image is too large (21.0 MB); the limit is 20 MB.");
    expect(host.text()).toBe("Hello");
  });

  it("a failed upload removes the placeholder and reports it", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [{ id: "p1", type: "paragraph", text: "Hello" }]);
    await engine.load();
    engine.api.uploadFile = async () => { throw { kind: "network", message: "Network error: offline", transient: true }; };
    expect(await engine.insertImage(png, "a.png", "image/png", 0)).toBe(false);
    expect(host.text()).toBe("Hello");
    expect(engine.errorMessage).toBe("Image not uploaded: Network error: offline");
  });

  it("imageDeleteGuard: Backspace on image paragraphs deletes the blocks through the mass-delete guard", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [imageSeed("i1"), imageSeed("i2"), imageSeed("i3"), { id: "p1", type: "paragraph", text: "Text" }]);
    await engine.load();
    expect(host.kinds().map((k) => k.t === "image")).toEqual([true, true, true, false]);
    server.clearLog();
    for (let i = 0; i < 3; i++) host.removeParagraph(0);
    expect(host.text()).toBe("Text");
    await engine.syncNow();
    expect(server.writes).toEqual([]);
    expect(engine.pendingMassDelete).toBe(3);

    await engine.confirmMassDelete();
    expect(server.writes.filter((w) => w.method === "DELETE")).toHaveLength(3);
    expect(server.childIds("page-1")).toEqual(["p1"]);
  });

  it("undo brings a deleted picture back with its id (no new insert)", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [imageSeed("i"), { id: "p", type: "paragraph", text: "After" }]);
    await engine.load();
    host.removeParagraph(0);
    expect(host.blockIds()).toEqual(["p"]);
    host.undo();
    expect(host.blockIds()).toEqual(["i", "p"]);
    expect(host.kinds()[0]!.t).toBe("image");
    server.clearLog();
    await engine.syncNow();
    expect(server.writes).toEqual([]);
  });

  it("a recreated Notion-hosted image (indented) is re-uploaded from its bytes, then appended", async () => {
    const { server, host, engine } = makeHarness({ seed: false });
    server.seed("page-1", [{ id: "b", type: "bulleted_list_item", text: "Parent" }, imageSeed("i")]);
    await engine.load();
    engine.imageDataProvider = async () => png;
    server.clearLog();
    host.setDepth(1, 1);
    await engine.syncNow();
    expect(server.writes.map((w) => w.description)).toEqual([
      "POST /v1/file_uploads", "POST /v1/file_uploads/fu-1/send", "PATCH /v1/blocks/b/children", "DELETE /v1/blocks/i",
    ]);
    expect(at(server.writes[2]!.body, "children", 0, "image", "file_upload", "id")).toBe("fu-1");
    expect(at(server.writes[2]!.body, "position", "type")).toBe("start");
  });

  it("comparable strips the signature from file image URLs only", () => {
    const a = [s("i", "", K.image("file:https://f.example/a.png?X=1")), s("e", "", K.image("external:https://f.example/b.png?X=1"))];
    const c = comparable(a);
    expect(c[0]!.kind).toEqual(K.image("file:https://f.example/a.png"));
    expect(c[1]!.kind).toEqual(K.image("external:https://f.example/b.png?X=1"));
  });

  it("freshImageUrl re-reads a block's file URL", async () => {
    const { server, engine } = makeHarness({ seed: false });
    server.seed("page-1", [imageSeed("i")]);
    expect(await engine.freshImageUrl("i")).toBe("https://files.example/i.png?sig=1");
    expect(await engine.freshImageUrl("nope")).toBeNull();
  });
});
