import { HeroVideo } from "./HeroVideo";
import { SectionHead } from "./SectionHead";

/** The full screen recording that used to sit in the hero. */
export function SeeItForReal() {
  return (
    <section id="see-it">
      <div className="wrap">
        <SectionHead eyebrow="See it for real" title="The real app, in about a minute.">
          Recorded in demo mode with sample data: the pill unfolds, a peek ticks off a grocery item, a page is edited, and quick capture adds a task.
        </SectionHead>
        <HeroVideo />
      </div>
    </section>
  );
}
