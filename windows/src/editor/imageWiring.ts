import type { PageEditorEngine } from "../domain/editor/engine";
import type { BrinkDoc, ImageFile } from "./docPort";

/**
 * Inserts several images below the same block in reverse order, so they end up in the order given
 * (each lands directly under the block). Returns when all uploads settled.
 */
export function insertImages(engine: PageEditorEngine, files: ImageFile[], afterIndex: number): Promise<boolean[]> {
  return Promise.all([...files].reverse().map((f) => engine.insertImage(f.data, f.filename, f.contentType, afterIndex)));
}

/** Connects paste/drop, local previews and expired-URL refresh of a document to its engine. */
export function wireImages(doc: BrinkDoc, engine: PageEditorEngine): () => void {
  engine.onImageUploaded = (id, data) => {
    if (!doc.localImages.has(id)) doc.localImages.set(id, URL.createObjectURL(new Blob([data as BlobPart])));
  };
  engine.imageDataProvider = null;
  doc.freshImageUrl = (blockId) => engine.freshImageUrl(blockId);
  doc.onImages = (files, afterIndex) => { void insertImages(engine, files, afterIndex); };
  return () => {
    doc.freshImageUrl = null;
    doc.onImages = null;
    engine.onImageUploaded = null;
    for (const url of doc.localImages.values()) URL.revokeObjectURL(url);
    doc.localImages.clear();
  };
}
