import Image from "next/image";
import { asset, site } from "@/site";
import { HeroVideo } from "./HeroVideo";
import styles from "./Hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.copy}>
          <Image
            className={styles.icon}
            src={asset("assets/icon-512.png")}
            width={84}
            height={84}
            alt="Brink app icon: a black notch on a screen edge with a blue checkbox"
            priority
            unoptimized
          />
          <h1>
            Brink<span>{site.tagline}</span>
          </h1>
          <p className={`lede ${styles.lede}`}>
            A quiet black notch on your screen edge. Hover to peek at your Notion pages and tasks, click to check things off, press a hotkey to capture. A menu bar app for your Notion pages that stays out of your way.
          </p>
          <div className={styles.cta}>
            <a className="btn" href={site.downloadUrl}>Download for Mac &middot; {site.price}</a>
            <a className="btn ghost" href="#features">See how it works</a>
          </div>
          <p className={styles.works}>Works with Notion &middot; macOS 14+</p>
        </div>
        <HeroVideo />
      </div>
    </section>
  );
}
