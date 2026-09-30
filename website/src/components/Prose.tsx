import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs";
import styles from "./Prose.module.css";

interface Props {
  title: string;
  children: ReactNode;
  wide?: boolean;
  /** Breadcrumb trail: page name and its path relative to the site root. */
  crumb?: { name: string; path: string };
}

export function Prose({ title, children, wide, crumb }: Props) {
  return (
    <div className="wrap">
      <article className={`${styles.prose} ${wide ? styles.wide : ""}`}>
        {crumb && <Breadcrumbs name={crumb.name} path={crumb.path} />}
        <h1>{title}</h1>
        {children}
      </article>
    </div>
  );
}
