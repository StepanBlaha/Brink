import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import styles from "./FeatureGrid.module.css";

interface Cell {
  icon: string;
  title: ReactNode;
  body: ReactNode;
  wide?: boolean;
}

const cells: Cell[] = [
  { icon: "✎", wide: true, title: "Notion-style editor with slash menu", body: <>Pages render white on black and edit like a single Markdown document where each line is one block. Type <kbd>/</kbd> for headings, to-dos, toggles, callouts and more. Find in page with <kbd>&#8984;F</kbd>.</> },
  { icon: "●", title: <>Badges &amp; live pill</>, body: "See what is due today on the pill itself. Badges update quietly in the background." },
  { icon: "☰", title: "Menu-bar mini-list", body: "Prefer the top of the screen? A compact list lives in the menu bar too, a proper menu bar app for your Notion pages when you want one." },
  { icon: "▣", title: "Desktop widget", body: "A Notion widget for Mac: pin your task list to the desktop or Notification Center." },
  { icon: "↗", title: "Send to Brink", body: "A share extension in every app. Send a link, selection or file straight to a page or database." },
  { icon: "⌘", title: "Hotkeys", body: "Global shortcuts for quick capture and for opening your last pin. Rebind them in Settings." },
  { icon: "☇", wide: true, title: <>Groups &amp; saved views</>, body: <>Group pins into folders that unfold on the strip. Pin a filtered and sorted database view, such as &ldquo;My open tasks by due date&rdquo;, and check things off without opening the full database.</> },
];

export function FeatureGrid() {
  return (
    <section className={styles.section}>
      <div className="wrap">
        <Reveal className={styles.grid}>
          {cells.map((c, i) => (
            <div key={i} className={`${styles.cell} ${c.wide ? styles.wide : ""}`}>
              <div className={styles.ic} aria-hidden="true">{c.icon}</div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
