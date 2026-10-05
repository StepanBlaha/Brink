import { invoke } from "@tauri-apps/api/core";
import { imageExtensions } from "./plugins/images";
import type { ImageFile } from "./docPort";
import { tooLargeMessage } from "../domain/editor/engineErrors";

const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const mime = (ext: string): string => (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "tif" || ext === "tiff" ? "image/tiff" : `image/${ext}`);

/** Reads dropped image paths through Rust (WebView2 hides file drops from the DOM when dragDropEnabled is on). */
export async function readDroppedImages(paths: string[], onError: (message: string) => void): Promise<ImageFile[]> {
  const out: ImageFile[] = [];
  for (const path of paths) {
    const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
    if (!imageExtensions.includes(ext)) continue;
    try {
      const buf = await invoke<ArrayBuffer>("read_image_file", { path });
      out.push({ data: new Uint8Array(buf), filename: name, contentType: mime(ext) });
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      onError(err.kind === "tooLarge" ? tooLargeMessage(Number(err.message)) : `Image not uploaded: ${err.message ?? String(e)}`);
    }
  }
  return out;
}

/** Subscribes to Tauri's file drop event; positions are physical pixels of the webview. No-op in a browser. */
export async function listenFileDrops(onDrop: (paths: string[], x: number, y: number) => void): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((e) => {
    if (e.payload.type !== "drop") return;
    const dpr = window.devicePixelRatio || 1;
    onDrop(e.payload.paths, e.payload.position.x / dpr, e.payload.position.y / dpr);
  });
}
