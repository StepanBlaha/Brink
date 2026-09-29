"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { site } from "@/site";
import styles from "./Header.module.css";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#faq", label: "FAQ" },
  { href: "/press/", label: "Press" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className={styles.nav} aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.href === path ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <a className={styles.cta} href={site.downloadUrl}>Download</a>
    </nav>
  );
}
