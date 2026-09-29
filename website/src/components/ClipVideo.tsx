"use client";

import { useEffect, useRef } from "react";
import { asset } from "@/site";
import styles from "./ClipVideo.module.css";

export interface ClipSource {
  src: string;
  type: "video/mp4" | "video/webm";
}

export interface ClipVideoProps {
  sources: ClipSource[];
  poster: string;
  label: string;
  stillAlt: string;
  width: number;
  height: number;
}

/**
 * Autoplaying muted loop. With prefers-reduced-motion the video is never
 * played and CSS shows the poster still instead; otherwise it pauses while
 * offscreen so it does not keep decoding.
 */
export function ClipVideo({ sources, poster, label, stillAlt, width, height }: ClipVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.removeAttribute("autoplay");
      video.preload = "none";
      video.pause();
      return;
    }
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.15 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <video
        ref={ref}
        className={styles.video}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={asset(poster)}
        width={width}
        height={height}
        aria-label={label}
      >
        {sources.map((s) => (
          <source key={s.src} src={asset(s.src)} type={s.type} />
        ))}
      </video>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.still} src={asset(poster)} width={width} height={height} alt={stillAlt} />
    </>
  );
}
