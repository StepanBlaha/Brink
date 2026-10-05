import type { NewBlock } from "../notion/newBlock";
import { isImage, imageSourceEncoded, parseImageSource } from "../markdown/paragraphKind";
import { contentTypeForFilename, newBlockFor } from "./blockConvert";
import { engineConfig } from "./engineConfig";
import { humanMessage, tooLargeMessage } from "./engineErrors";
import type { PageEditorEngine } from "./engine";
import type { DocParagraph, SyncedParagraph } from "./types";

// Images: paste/drop, "Uploading image…" placeholder, upload, the placeholder turns into an image
// paragraph (`upload:ID`), the next sync appends it as `file_upload`. Image blocks are never
// updated; a moved one is recreated (a Notion-hosted file is re-uploaded, its signed URL expires).

/** Uploads `data` and inserts it as an image block after the paragraph at `afterParagraphIndex`. */
export async function insertImage(
  engine: PageEditorEngine, data: Uint8Array, filename: string, contentType: string, afterParagraphIndex: number,
): Promise<boolean> {
  if (!engine.hasLoaded) return false;
  if (data.byteLength > engineConfig.singlePartUploadLimit) {
    engine.setError(tooLargeMessage(data.byteLength));
    return false;
  }
  const placeholder = engine.doc.insertUploadPlaceholder(afterParagraphIndex);
  try {
    const id = await engine.api.uploadFile(data, filename, contentType);
    engine.onImageUploaded?.(id, data);
    if (!engine.doc.replacePlaceholder(placeholder, id)) return false; // undone: drop the result
    return true;
  } catch (e) {
    engine.doc.removePlaceholder(placeholder);
    engine.setError(`Image not uploaded: ${humanMessage(e)}`);
    return false;
  }
}

/** A fresh signed URL for an image block (Notion file URLs expire, 403). */
export async function freshImageUrl(engine: PageEditorEngine, blockId: string): Promise<string | null> {
  try {
    const block = await engine.api.retrieveBlock(blockId);
    const src = block.imageSource === undefined ? undefined : parseImageSource(block.imageSource);
    return src && src.t !== "upload" ? src.url : null;
  } catch {
    return null;
  }
}

/** The blocks to append; a Notion-hosted image being recreated (moved) is re-uploaded first. */
export async function prepareBlocks(engine: PageEditorEngine, paragraphs: DocParagraph[]): Promise<NewBlock[]> {
  const out: NewBlock[] = [];
  for (const p of paragraphs) {
    const src = p.kind.t === "image" ? parseImageSource(p.kind.source) : undefined;
    if (src?.t === "file") {
      let data = await engine.imageDataProvider?.(src.url) ?? null;
      if (!data) {
        const res = await fetch(src.url);
        if (!res.ok) throw new Error("Couldn't download the image to move it");
        data = new Uint8Array(await res.arrayBuffer());
      }
      const path = src.url.split("?")[0]!.split("#")[0]!;
      const last = path.slice(path.lastIndexOf("/") + 1);
      const name = last === "" ? "image.png" : last;
      out.push({ kind: "imageUpload", id: await engine.api.uploadFile(data, name, contentTypeForFilename(name)) });
    } else out.push(newBlockFor(p));
  }
  return out;
}

/** Blocks with image URLs stripped of their signatures (Notion re-signs file URLs on every fetch). */
export function comparable(blocks: SyncedParagraph[]): SyncedParagraph[] {
  return blocks.map((b) => {
    if (!isImage(b.kind) || b.kind.t !== "image") return b;
    const src = parseImageSource(b.kind.source);
    if (src?.t !== "file") return b;
    const q = src.url.indexOf("?");
    const url = q >= 0 ? src.url.slice(0, q) : src.url;
    return { ...b, kind: { t: "image", source: imageSourceEncoded({ t: "file", url }) } };
  });
}

