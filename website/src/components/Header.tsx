import { Brand } from "./Brand";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { HeaderShell } from "./HeaderShell";
import { ScrollProgress } from "./ScrollProgress";
import styles from "./Header.module.css";

export function Header() {
  return (
    <>
      <ScrollProgress />
      <HeaderShell>
        <div className={`wrap ${styles.inner}`}>
          <Brand />
          <div className={styles.right}>
            <NavLinks />
            <MobileMenu />
          </div>
        </div>
      </HeaderShell>
    </>
  );
}
