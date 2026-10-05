import styles from "./backdrop.module.css";

/** The dusk wallpaper (branding/BRAND.md): gradient plus warm glow, white sheen, vignette. */
export function DuskLayers({ className = "" }: { className?: string }) {
  return (
    <div className={`${styles.dusk} ${className}`} data-testid="dusk" aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.sheen} />
      <div className={styles.vignette} />
    </div>
  );
}

/** `#/backdrop`: the full-screen demo window. Rust makes it click-through and bottom of Brink's stack. */
export function DemoBackdrop() {
  return (
    <div className={styles.root} data-window="backdrop">
      <DuskLayers />
    </div>
  );
}
