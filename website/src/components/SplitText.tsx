import type { CSSProperties } from "react";
import styles from "./SplitText.module.css";

interface Props {
  text: string;
  /** Seconds before the first word appears. */
  delay?: number;
  /** Seconds between words. */
  step?: number;
  className?: string;
}

/**
 * Word-by-word intro. Plain server-rendered HTML: the words are visible in the static
 * markup and animate with a CSS keyframe (see .intro in globals.css) that runs at first
 * paint, without waiting for hydration. Selectable text, no layout shift.
 */
export function SplitText({ text, delay = 0, step = 0.04, className }: Props) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <span className={`intro ${styles.word}`} style={{ "--d": `${(delay + i * step).toFixed(3)}s` } as CSSProperties}>
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
