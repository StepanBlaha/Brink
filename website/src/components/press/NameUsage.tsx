import { site } from "@/site";
import styles from "./Press.module.css";

export function NameUsage() {
  return (
    <>
      <h2>Name usage</h2>
      <div className={styles.dos}>
        <div className={styles.card}>
          <h3>Do</h3>
          <ul>
            <li>Write <strong>Brink</strong>, capital B, lowercase rest.</li>
            <li>Say &ldquo;Works with Notion&rdquo; in plain text, secondary to the Brink name.</li>
            <li>Include the non-affiliation line below wherever Brink is described.</li>
          </ul>
        </div>
        <div className={styles.card}>
          <h3>Don&rsquo;t</h3>
          <ul>
            <li>&ldquo;BRINK&rdquo;, &ldquo;brink app&rdquo; or &ldquo;Brink for Notion&rdquo;.</li>
            <li>Put &ldquo;Notion&rdquo; in the product name, logo, domain or social handles.</li>
            <li>Combine the icon with the Notion logo or imply endorsement.</li>
          </ul>
        </div>
      </div>
      <p className={styles.disclaimer}>{site.disclaimer}</p>
    </>
  );
}
