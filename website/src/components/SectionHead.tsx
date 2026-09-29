import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import styles from "./SectionHead.module.css";

interface Props {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}

export function SectionHead({ eyebrow, title, children }: Props) {
  return (
    <Reveal className={styles.head}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children && <p className="lede">{children}</p>}
    </Reveal>
  );
}
