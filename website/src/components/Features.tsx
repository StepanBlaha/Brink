import { SectionHead } from "./SectionHead";
import { FeatureClip } from "./FeatureClip";
import { FeatureSection } from "./FeatureSection";
import { FeatureGrid } from "./FeatureGrid";
import { Customization } from "./Customization";

/** The #features block: intro, three clip bands, capability grid, customization. */
export function Features() {
  return (
    <>
      <section id="features" style={{ paddingBottom: "clamp(48px, 7vw, 104px)" }}>
        <div className="wrap">
          <SectionHead eyebrow="Features" title="Everything within one hover.">
            Brink is a notch app for Mac and Windows that turns the edge of your screen into a fast lane to the Notion pages and tasks you actually use. Works with Notion, and with Apple Notes (Mac only).
          </SectionHead>
        </div>
      </section>

      <FeatureSection
        tight
        eyebrow="Hover peek"
        title="See it without opening it."
        media={
          <FeatureClip
            sources={[{ src: "assets/media/peek-tick.mp4", type: "video/mp4" }]}
            poster="assets/media/peek-tick-poster.jpg"
            width={1200}
            height={750}
            label="Screen recording: hovering the notch shows a peek of the Groceries page, and Oat milk gets ticked off without opening the page."
            stillAlt="A hover peek card listing grocery items next to the notch strip."
          />
        }
      >
        Rest your cursor on the notch and a strip of your pinned pages unfolds. Peek at the next tasks, glance at a badge, and move on. Resting pill, strip and panel are one morphing shape with a liquid spring, and opening and closing mirror each other.
      </FeatureSection>

      <FeatureSection
        tight
        flip
        eyebrow="Notion quick capture"
        title="Capture in under three seconds."
        media={
          <FeatureClip
            sources={[{ src: "assets/media/capture.mp4", type: "video/mp4" }]}
            poster="assets/media/capture-poster.jpg"
            width={1200}
            height={750}
            label="Screen recording: Option-Shift-Space opens quick capture, “Call Anna tomorrow 5pm” shows a Tomorrow 17:00 date chip, and return adds it to the Sprint database."
            stillAlt="The quick-capture box with the text Call Anna tomorrow 5pm and a Tomorrow 17:00 date chip."
          />
        }
      >
        Press <kbd>&#8997;&#8679;Space</kbd> from any app, type, hit return. Natural dates work in English and Czech, so &ldquo;friday&rdquo; and &ldquo;p&aacute;tek&rdquo; both land on the right day. Perfect for Notion tasks on Mac without the Notion round trip.
      </FeatureSection>

      <FeatureSection
        tight
        eyebrow="Editor"
        title="A Notion-style editor, one hover away."
        media={
          <FeatureClip
            sources={[{ src: "assets/media/editor.mp4", type: "video/mp4" }]}
            poster="assets/media/editor-poster.jpg"
            width={1200}
            height={750}
            label="Screen recording: typing Markdown in the Launch plan page creates a to-do, a heading and bold text, then the slash menu filters to To-do."
            stillAlt="The Launch plan page open in the notch panel with headings, to-dos and a callout."
          />
        }
      >
        Type Markdown and it turns into real blocks as you go: <code>[]</code> becomes a checkbox, <code>##</code> a heading, <code>**bold**</code> bold. Press <kbd>/</kbd> for the block menu.
      </FeatureSection>

      <FeatureGrid />
      <Customization />
    </>
  );
}
