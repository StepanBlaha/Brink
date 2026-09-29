import { ClipVideo, type ClipVideoProps } from "./ClipVideo";
import { MediaReveal } from "./MediaReveal";
import { Parallax } from "./Parallax";

export function FeatureClip(props: ClipVideoProps) {
  return (
    <Parallax speed={0.05}>
      <MediaReveal>
        <ClipVideo {...props} />
      </MediaReveal>
    </Parallax>
  );
}
