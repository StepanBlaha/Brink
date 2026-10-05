"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import { asset, site } from "@/site";
import { Reveal } from "./Reveal";
import { Parallax } from "./Parallax";
import { MagneticLink } from "./MagneticLink";
import styles from "./DownloadSection.module.css";

type Os = "mac" | "windows";

/** Best-effort guess from the user agent; Mac is the default (SSR and unknown). */
function detectOs(): Os {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform ?? nav.userAgent).toLowerCase();
  return p.includes("win") ? "windows" : "mac";
}

const subscribeNever = () => () => {};

export function DownloadSection() {
  const detected = useSyncExternalStore(subscribeNever, detectOs, () => "mac" as Os);
  const [choice, setOs] = useState<Os | null>(null);
  const os = choice ?? detected;

  return (
    <section id="download" className={styles.dl}>
      <Parallax speed={0.05}><Reveal className="wrap" stagger={0.08}>
        <Image className={styles.icon} src={asset("assets/icon-256.png")} width={96} height={96} alt="" unoptimized />
        <h2>Put your pages on the edge.</h2>
        <div className={styles.tabs} role="tablist" aria-label="Choose your system">
          {(["mac", "windows"] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="tab"
              aria-selected={os === o}
              className={styles.tab}
              onClick={() => setOs(o)}
            >
              {o === "mac" ? "Mac" : "Windows"}
            </button>
          ))}
        </div>
        {os === "mac" ? (
          <>
            <p className={`lede ${styles.lede}`}>
              {site.price}. macOS 14 or later. First launch: right-click Brink &rarr; Open (the app is not notarized yet).
            </p>
            <MagneticLink className="btn" href={site.downloadUrl}>Download for Mac &middot; {site.price}</MagneticLink>
          </>
        ) : site.windowsAvailable ? (
          <>
            <p className={`lede ${styles.lede}`}>
              {site.price}. Windows 10 22H2 or Windows 11, x64 or ARM64. Windows may show a SmartScreen warning on
              first run: choose More info &rarr; Run anyway.
            </p>
            <MagneticLink className="btn" href={site.windowsX64Url}>Download for Windows &middot; x64</MagneticLink>
            <p className={styles.works}>
              <a href={site.windowsArm64Url}>ARM64 installer</a> &middot; or run <code>{site.wingetCommand}</code>
            </p>
          </>
        ) : (
          <>
            <p className={`lede ${styles.lede}`}>
              Brink for Windows 10 and 11 is built and in testing. It will be free.
            </p>
            <span className={`btn ${styles.soon}`} aria-disabled="true">Windows &middot; Coming soon</span>
          </>
        )}
        <p className={styles.works}>Works with Notion &middot; Version {site.version}</p>
      </Reveal></Parallax>
    </section>
  );
}
