import { site } from "@/site";
import { MagneticLink } from "./MagneticLink";
import { Reveal } from "./Reveal";
import { SplitText } from "./SplitText";
import { NotchDemo } from "./notch/NotchDemo";
import styles from "./Hero.module.css";

const LEDE =
  "A quiet black notch on your screen edge. Hover to peek at your Notion pages and tasks, click to check things off, press a hotkey to capture. A menu bar app for your Notion pages that stays out of your way.";

export function Hero() {
  return (
    <section id="hero" className={styles.hero}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.copy}>
          <h1>
            <SplitText text="Brink" />
            <SplitText text={site.tagline} delay={0.25} className={styles.tag} />
          </h1>
          <p className={`lede ${styles.lede}`}>
            <SplitText text={LEDE} delay={0.5} step={0.012} />
          </p>
          <Reveal className={styles.cta} delay={0.9}>
            <MagneticLink className="btn" href={site.downloadUrl}>Download for Mac &middot; {site.price}</MagneticLink>
            <a className="btn ghost" href="#features">See how it works</a>
          </Reveal>
          <Reveal as="p" className={styles.works} delay={1}>Works with Notion &middot; macOS 14+</Reveal>
        </div>
        <Reveal delay={0.35} y={30}>
          <NotchDemo />
        </Reveal>
      </div>
    </section>
  );
}
