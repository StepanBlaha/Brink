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
          Your token lives in the macOS Keychain. Brink has no server of its own, no analytics, no ads and no telemetry. It talks to the Notion API and nothing else.
        </Reveal>
        <Reveal>
          <Link className="btn ghost" href="/privacy/">Read the privacy policy</Link>
        </Reveal>
      </div>
    </section>
  );
}
