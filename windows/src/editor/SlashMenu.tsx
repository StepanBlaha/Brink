import { useLayoutEffect, useRef, useState } from "react";
import { slashTitle, type SlashCommand } from "../domain/markdown/slashCommand";
import styles from "./editor.module.css";

const glyph: Record<SlashCommand, string> = {
  text: "T", heading1: "H1", heading2: "H2", heading3: "H3", toDo: "☐", bulleted: "•", numbered: "1.",
  quote: "❝", code: "</>", divider: "-", toggle: "▸", callout: "💡",
};

interface Props {
  items: SlashCommand[];
  index: number;
  /** Caret box in container coordinates. */
  anchor: { x: number; y: number; h: number };
  containerHeight: number;
  onHover: (i: number) => void;
  onPick: (c: SlashCommand) => void;
}

/** 220 px wide, 28 px rows + 8, below the slash, flipped above when it would overflow (SLM L28-174). */
export function SlashMenu({ items, index, anchor, containerHeight, onHover, onPick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);
  const height = Math.max(items.length, 1) * 28 + 8;
  useLayoutEffect(() => setFlip(anchor.y + anchor.h + height > containerHeight && anchor.y - height > 0), [anchor.y, anchor.h, height, containerHeight]);
  const top = flip ? anchor.y - height - 4 : anchor.y + anchor.h + 4;
  return (
    <div ref={ref} className={styles.slash} style={{ left: Math.max(4, anchor.x), top }} role="listbox" aria-label="Commands" onMouseDown={(e) => e.preventDefault()}>
      {items.length === 0 ? <div className={styles.slashEmpty}>No results</div> : items.map((c, i) => (
        <div key={c} role="option" aria-selected={i === index} className={`${styles.slashRow} ${i === index ? styles.slashOn : ""}`} onMouseEnter={() => onHover(i)} onClick={() => onPick(c)}>
          <span className={styles.slashGlyph}>{glyph[c]}</span>
          {slashTitle(c)}
        </div>
      ))}
    </div>
  );
}
