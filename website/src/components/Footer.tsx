import Link from "next/link";
import { copyrightYears, site } from "@/site";
import { Brand } from "./Brand";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.foot}>
      <div className="wrap">
        <div className={styles.cols}>
          <Brand />
          <nav className={styles.links} aria-label="Footer">
            <Link href="/privacy/">Privacy</Link>
            <Link href="/terms/">Terms</Link>
            <Link href="/acknowledgements/">Acknowledgements</Link>
            <Link href="/press/">Press kit</Link>
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            <a href={site.repoUrl} rel="noopener">GitHub</a>
          </nav>
        </div>
        <p className={styles.disclaimer}>
          {site.disclaimer} {site.trademark}
        </p>
        <p className="small">&copy; {copyrightYears()} {site.author}</p>
      </div>
    </footer>
  );
}
