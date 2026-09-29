import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import styles from "./FeatureSection.module.css";

interface Props {
  eyebrow: string;
  title: string;
  children: ReactNode;
  /** Right-hand visual (a FeatureClip or card). Rendered first when `flip`. */
  media: ReactNode;
  flip?: boolean;
  /** Drop the top padding when stacked under another band. */
  tight?: boolean;
  extra?: ReactNode;
}

export function FeatureSection({ eyebrow, title, children, media, flip, tight, extra }: Props) {
  return (
    <section className={tight ? styles.tight : undefined}>
      <div className={`wrap ${styles.split} ${flip ? styles.flip : ""}`}>
        <Reveal className={styles.text}>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="lede">{children}</p>
          {extra}
        </Reveal>
        {media}
      </div>
    </section>
  );
}
