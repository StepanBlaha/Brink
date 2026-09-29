import Image from "next/image";
import { asset } from "@/site";
import styles from "./Press.module.css";

const items = [
  { href: "assets/icon-1024.png", preview: "assets/icon-256.png", w: 96, h: 96, alt: "Brink icon preview", label: "PNG 1024" },
  { href: "assets/icon-512.png", preview: "assets/icon-256.png", w: 64, h: 64, alt: "Brink icon preview", label: "PNG 512" },
  { href: "assets/icon-256.png", preview: "assets/icon-256.png", w: 48, h: 48, alt: "Brink icon preview", label: "PNG 256" },
  { href: "assets/og.png", preview: "assets/og.png", w: 150, h: 79, alt: "Brink social card", label: "Social card 1200×630" },
];

export function Downloads() {
  return (
    <>
      <h2>Icon</h2>
      <div className={styles.dlList}>
        {items.map((i) => (
          <a key={i.href} href={asset(i.href)} download>
            <Image src={asset(i.preview)} width={i.w} height={i.h} alt={i.alt} unoptimized />
            {i.label}
          </a>
        ))}
      </div>
    </>
  );
}
