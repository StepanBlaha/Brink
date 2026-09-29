import { ClipVideo, type ClipVideoProps } from "./ClipVideo";
import { Reveal } from "./Reveal";
import styles from "./FeatureClip.module.css";

export function FeatureClip(props: ClipVideoProps) {
  return (
    <Reveal as="figure" className={styles.media}>
      <ClipVideo {...props} />
    </Reveal>
  );
}
