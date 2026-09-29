import Image from "next/image";
import Link from "next/link";
import { asset } from "@/site";
import styles from "./Brand.module.css";

export function Brand() {
  return (
    <Link className={styles.brand} href="/">
      <Image src={asset("assets/icon-256.png")} alt="" width={28} height={28} unoptimized />
      Brink
    </Link>
  );
}
