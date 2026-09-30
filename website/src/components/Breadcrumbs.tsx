import Link from "next/link";
import { absoluteUrl } from "@/site";
import { JsonLd } from "./JsonLd";
import styles from "./Prose.module.css";

/** Visible "Home > Page" trail plus BreadcrumbList JSON-LD. */
export function Breadcrumbs({ name, path }: { name: string; path: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl() },
      { "@type": "ListItem", position: 2, name, item: absoluteUrl(path) },
    ],
  };
  return (
    <>
      <JsonLd data={data} />
      <nav aria-label="Breadcrumb" className={styles.crumbs}>
        <ol>
          <li><Link href="/">Home</Link></li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>
    </>
  );
}
