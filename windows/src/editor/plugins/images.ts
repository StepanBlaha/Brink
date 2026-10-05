import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { BrinkDoc, ImageFile } from "../docPort";

const passThrough = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic"]);
export const imageExtensions = [...passThrough, "tif", "tiff", "bmp"];

const extOf = (name: string): string => (name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "");
const mimeFor = (ext: string): string => (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "heic" ? "image/heic" : `image/${ext}`);

/** Draws any browser-decodable image to PNG bytes (tiff, bmp and friends). */
export async function convertToPng(file: Blob): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * Bytes, name and type for upload (ETV+Images): png, jpg, jpeg, gif, webp, heic pass through, other
 * images become PNG. `pasted` clipboard images get "Pasted image.png" / "Pasted image.jpg".
 */
export async function readImageFile(
  file: { name: string; type: string; arrayBuffer(): Promise<ArrayBuffer> }, pasted: boolean,
  convert: (f: never) => Promise<Uint8Array | null> = convertToPng as never,
): Promise<ImageFile | null> {
  const ext = extOf(file.name) || file.type.replace("image/", "").replace("jpeg", "jpg");
  if (passThrough.has(ext)) {
    const name = pasted ? `Pasted image.${ext === "jpeg" ? "jpg" : ext}` : file.name;
    return { data: new Uint8Array(await file.arrayBuffer()), filename: name, contentType: file.type.startsWith("image/") ? file.type : mimeFor(ext) };
  }
  const png = await convert(file as never);
  if (!png) return null;
  const base = file.name.includes(".") ? file.name.slice(0, file.name.lastIndexOf(".")) : file.name;
  return { data: png, filename: pasted || base === "" ? "Pasted image.png" : `${base}.png`, contentType: "image/png" };
}

const imageFiles = (list: FileList | undefined | null): File[] =>
  Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || imageExtensions.includes(extOf(f.name)));

async function deliver(doc: () => BrinkDoc | null, files: File[], pasted: boolean, afterIndex: number): Promise<void> {
  const out: ImageFile[] = [];
  for (const f of files) {
    const r = await readImageFile(f, pasted);
    if (r) out.push(r);
  }
  if (out.length > 0) doc()?.onImages?.(out, afterIndex);
}

/** The block index a selection or drop position falls into. */
const blockIndexAt = (view: EditorView, pos: number): number => view.state.doc.resolve(Math.min(pos, view.state.doc.content.size)).index(0);

/** Clipboard images and dropped files in the DOM (the app also gets dropped paths from Tauri). */
export const imagesPlugin = (doc: () => BrinkDoc | null): Plugin =>
  new Plugin({
    props: {
      handlePaste(view, event) {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        void deliver(doc, files, true, blockIndexAt(view, view.state.selection.to));
        return true;
      },
      handleDrop(view, event) {
        const files = imageFiles(event.dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        let at: { pos: number } | null = null;
        try { at = view.posAtCoords({ left: event.clientX, top: event.clientY }); } catch { /* no layout */ }
        void deliver(doc, files, false, at ? blockIndexAt(view, at.pos) : view.state.doc.childCount - 1);
        return true;
      },
    },
  });
