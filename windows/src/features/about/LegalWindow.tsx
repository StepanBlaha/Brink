import { useEffect } from "react";
import { openUrl } from "../../ipc/captureIpc";
import { isLegalDoc, LEGAL } from "./legalDocs";
import { parseLegal, type Inline } from "./legalMarkdown";
import styles from "./about.module.css";

function Spans({ spans }: { spans: Inline[] }) {
  return spans.map((s, i) => {
    switch (s.t) {
      case "bold": return <strong key={i}>{s.text}</strong>;
      case "italic": return <em key={i}>{s.text}</em>;
      case "code": return <code key={i}>{s.text}</code>;
      case "link": return <button key={i} type="button" className={styles.link} onClick={() => void openUrl(s.href).catch(() => {})}>{s.text}</button>;
      case "text": return s.text;
    }
  });
}

/** A bundled legal text: `#/legal/privacy`, `#/legal/terms`, `#/legal/notice`. */
export function LegalWindow({ doc }: { doc?: string | undefined }) {
  const id = isLegalDoc(doc) ? doc : "privacy";
  const { title, text } = LEGAL[id];
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <main className={styles.doc} aria-label={title}>
      {parseLegal(text).map((b, i) =>
        b.kind === "heading" ? (
          b.level === 1 ? <h1 key={i}><Spans spans={b.spans} /></h1> : <h2 key={i}><Spans spans={b.spans} /></h2>
        ) : b.kind === "bullet" ? (
          <div key={i} className={styles.bullet}><span className={styles.dot} aria-hidden>{"•"}</span><span><Spans spans={b.spans} /></span></div>
        ) : (
          <p key={i}><Spans spans={b.spans} /></p>
        ),
      )}
    </main>
  );
}
