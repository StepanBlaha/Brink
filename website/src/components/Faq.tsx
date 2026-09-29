import { faq } from "@/lib/faq";
import { Reveal } from "./Reveal";
import { SectionHead } from "./SectionHead";
import styles from "./Faq.module.css";

export function Faq() {
  return (
    <section id="faq">
      <div className="wrap">
        <SectionHead eyebrow="FAQ" title="Questions, answered." />
        <Reveal className={styles.faq}>
          {faq.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.content}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
