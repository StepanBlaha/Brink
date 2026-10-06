import Link from "next/link";
import { site } from "@/site";
import styles from "./Press.module.css";

export function Facts() {
  return (
    <>
      <h2>Facts</h2>
      <dl className={styles.facts}>
        <dt>Name</dt><dd>Brink</dd>
        <dt>Category</dt><dd>Productivity</dd>
        <dt>Platform</dt><dd>macOS 14 or later; Windows 10 (22H2) or Windows 11</dd>
        <dt>Version</dt><dd>{site.version}</dd>
        <dt>Maker</dt><dd>{site.author}</dd>
        <dt>Requires</dt><dd>A Notion internal integration</dd>
        <dt>Languages</dt><dd>English; natural dates in English and Czech</dd>
        <dt>Privacy</dt><dd>No analytics, no tracking, nothing stored on a server. See the <Link href="/privacy/">privacy policy</Link>.</dd>
        <dt>Price</dt><dd>{site.price}</dd>
      </dl>
    </>
  );
}
