import Link from "next/link";
import { Reveal } from "./Reveal";
import styles from "./PrivacySection.module.css";

export function PrivacySection() {
  return (
    <section id="privacy" className={styles.privacy}>
      <div className="wrap">
        <span className="eyebrow">Privacy</span>
        <Reveal as="h2" className={styles.title}>Your data stays between your Mac and Notion. No tracking.</Reveal>
        <Reveal as="p" className={`lede ${styles.lede}`}>
          Your token lives in the macOS Keychain, and your pages never touch anyone else&rsquo;s server. No analytics, no ads, no telemetry. The optional one-click sign-in passes through a tiny relay that stores and logs nothing.
        </Reveal>
        <Reveal>
          <Link className="btn ghost" href="/privacy/">Read the privacy policy</Link>
        </Reveal>
      </div>
    </section>
  );
}
