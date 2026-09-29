import type { ReactNode } from "react";
import styles from "./Prose.module.css";

interface Props {
  title: string;
  children: ReactNode;
  wide?: boolean;
}

export function Prose({ title, children, wide }: Props) {
  return (
    <div className="wrap">
      <article className={`${styles.prose} ${wide ? styles.wide : ""}`}>
        <h1>{title}</h1>
        {children}
      </article>
    </div>
  );
}
