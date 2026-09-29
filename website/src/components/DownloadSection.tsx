import Image from "next/image";
import { asset, site } from "@/site";
import { Reveal } from "./Reveal";
import { Parallax } from "./Parallax";
import { MagneticLink } from "./MagneticLink";
import styles from "./DownloadSection.module.css";

export function DownloadSection() {
  return (
    <section id="download" className={styles.dl}>
      <Parallax speed={0.05}><Reveal className="wrap" stagger={0.08}>
        <Image className={styles.icon} src={asset("assets/icon-256.png")} width={96} height={96} alt="" unoptimized />
        <h2>Put your pages on the edge.</h2>
        <p className={`lede ${styles.lede}`}>
          {site.price}. macOS 14 or later. First launch: right-click Brink &rarr; Open (the app is not notarized yet).
        </p>
        <MagneticLink className="btn" href={site.downloadUrl}>Download for Mac &middot; {site.price}</MagneticLink>
        <p className={styles.works}>Works with Notion &middot; Version {site.version}</p>
      </Reveal></Parallax>
    </section>
  );
}
