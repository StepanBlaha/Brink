"use client";

import { useId, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { NotchShape } from "./NotchShape";
import { PinStrip } from "./PinStrip";
import { PinPanel } from "./PinPanel";
import { useNotch } from "./useNotch";
import styles from "./NotchDemo.module.css";

/** Interactive recreation of the Brink notch: hover/focus opens the strip, click a pin for its list. */
export function NotchDemo() {
  const reduce = !!useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const n = useNotch(root);
  const descId = useId();
  const hintId = useId();

  const pill = (
    <button
      ref={pillRef}
      type="button"
      className={styles.pill}
      tabIndex={n.mode === "rest" ? 0 : -1}
      aria-label="Brink notch demo"
      aria-describedby={descId}
      aria-expanded={n.mode !== "rest"}
      onFocus={n.focusIn}
      onClick={n.openStrip}
    />
  );

  return (
    <figure className={styles.wrap}>
      <div className={styles.screen} ref={root} onBlur={n.focusOut}>
        <div className={styles.menubar} aria-hidden="true"><i /><i /><i /><span /></div>
        <div className={styles.window} aria-hidden="true"><b /><u /><u /><u /></div>
        <div className={styles.bezel} aria-hidden="true" />
        <NotchShape
          mode={n.mode}
          reduce={reduce}
          pill={pill}
          onPointerEnter={(e) => n.hoverIn(e.pointerType)}
          onPointerLeave={(e) => n.hoverOut(e.pointerType)}
        >
          {n.mode === "strip" && <PinStrip key="strip" n={n} reduce={reduce} />}
          {n.mode === "panel" && <PinPanel key="panel" n={n} reduce={reduce} />}
        </NotchShape>
      </div>
      <p id={descId} className="sr-only">
        Interactive demo. Opens a strip of four pinned pages. Choose a pin to open its checklist, tick items to
        complete them, and press Escape to close.
      </p>
      <p className="sr-only" role="status" aria-live="polite">{n.status}</p>
      <figcaption className={styles.cap}>
        <button
          type="button"
          className={styles.hint}
          aria-describedby={hintId}
          onClick={() => { n.openStrip(); pillRef.current?.focus({ preventScroll: true }); }}
        >
          <span className={styles.fine}>Hover the notch &rarr;</span>
          <span className={styles.touch}>Tap the notch &rarr;</span>
        </button>
        <span id={hintId} className="sr-only">Moves focus to the demo notch and unfolds the pin strip.</span>
      </figcaption>
    </figure>
  );
}
