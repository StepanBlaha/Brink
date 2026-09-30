import { faq } from "@/lib/faq";
import { SectionHead } from "./SectionHead";
import { FaqAccordion } from "./FaqAccordion";

/** The visible FAQ and the FAQPage JSON-LD both come from src/lib/faq.tsx. */
export function Faq() {
  return (
    <section id="faq">
      <div className="wrap">
        <SectionHead eyebrow="FAQ" title="Questions, answered." center />
        <FaqAccordion items={faq.map(({ question, content }) => ({ question, content }))} />
      </div>
    </section>
  );
}
