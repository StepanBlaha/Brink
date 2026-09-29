import { ClipVideo } from "./ClipVideo";
import styles from "./HeroVideo.module.css";

export function HeroVideo() {
  return (
    <figure className={styles.media}>
      <ClipVideo
        sources={[
          { src: "assets/media/hero.webm", type: "video/webm" },
          { src: "assets/media/hero.mp4", type: "video/mp4" },
        ]}
        poster="assets/media/hero-poster.jpg"
        width={1600}
        height={1000}
        label="Screen recording: the black pill on the right screen edge unfolds into a strip of pinned pages, a hover peek ticks off a grocery item, a page is edited with Markdown and the slash menu, quick capture adds a task for tomorrow at 5 pm, and the menu-bar list opens."
        stillAlt="The Brink notch on the right screen edge, unfolded into a strip of pinned pages with a hover peek of a grocery list."
      />
      <figcaption className={styles.cap}>Resting pill, hover strip, expanded panel. One shape.</figcaption>
    </figure>
  );
}
