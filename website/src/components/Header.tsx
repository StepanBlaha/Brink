import { Brand } from "./Brand";
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
          <NavLinks />
        </div>
      </HeaderShell>
    </>
  );
}
