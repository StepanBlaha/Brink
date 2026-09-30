import { site } from "@/site";
import { MagneticLink } from "./MagneticLink";
import { SplitText } from "./SplitText";
import { NotchDemo } from "./notch/NotchDemo";
import type { CSSProperties } from "react";
import styles from "./Hero.module.css";

const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

const LEDE =
  "A quiet black notch on your screen edge. Hover to peek at your Notion pages and tasks, click to check things off, press a hotkey to capture. A menu bar app for your Notion pages that stays out of your way.";

export function Hero() {
  return (
    <section id="hero" className={styles.hero}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.copy}>
          <h1>
            <SplitText text="Brink" />
            <SplitText text={site.tagline} delay={0.08} step={0.03} className={styles.tag} />
          </h1>
          <p className={`intro lede ${styles.lede}`} style={d(0.12)}>{LEDE}</p>
          <div className={`intro ${styles.cta}`} style={d(0.2)}>
            <MagneticLink className="btn" href={site.downloadUrl}>Download for Mac &middot; {site.price}</MagneticLink>
            <a className="btn ghost" href="#features">See how it works</a>
          </div>
          <p className={`intro ${styles.works}`} style={d(0.25)}>Works with Notion &middot; macOS 14+</p>
        </div>
        <div className="intro" style={d(0.15)}>
          <NotchDemo />
        </div>
      </div>
    </section>
  );
}
