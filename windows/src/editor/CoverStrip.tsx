import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { FileRef } from "../domain/notion/pageMeta";
import { coverGet } from "../ipc/commands";
import styles from "./editor.module.css";

export const coverHeight = 56;

/** Resolves a cover to something an `<img>` can show; the Rust cache returns a local path (403 refetch happens there). */
export type CoverResolver = (cover: FileRef, pageId: string) => Promise<string | null>;

export const resolveCoverFromCache: CoverResolver = async (cover, pageId) => {
  try { return convertFileSrc(await coverGet(cover.url, pageId)); } catch { return null; }
};

/** The page cover as a 56 px strip fading into the black panel (CoverStrip.swift). No pointer events. */
export function CoverStrip({ cover, pageId, resolve = resolveCoverFromCache }: { cover: FileRef; pageId: string; resolve?: CoverResolver }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void resolve(cover, pageId).then((s) => { if (live) setSrc(s); });
    return () => { live = false; };
  }, [cover.url, pageId, resolve]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.cover} style={{ height: coverHeight }} data-testid="cover-strip" aria-hidden="true">
      {src ? <img className={styles.coverImg} src={src} alt="" draggable={false} /> : null}
      <div className={styles.coverFade} />
    </div>
  );
}
