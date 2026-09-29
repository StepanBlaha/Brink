import { Brand } from "./Brand";
import { NavLinks } from "./NavLinks";
import styles from "./Header.module.css";

export function Header() {
  return (
    <header className={styles.head}>
      <div className={`wrap ${styles.inner}`}>
        <Brand />
        <NavLinks />
      </div>
    </header>
  );
}
