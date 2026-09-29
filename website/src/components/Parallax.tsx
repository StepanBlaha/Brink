import type { CSSProperties, ReactNode } from "react";

interface Props {
  /** Locomotive Scroll speed factor; keep within about -0.15..0.15 to stay subtle. */
  speed: number;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/**
 * Plain wrapper carrying the Locomotive Scroll parallax attributes. It gets its
 * own element so the transform never collides with a motion animation inside.
 */
export function Parallax({ speed, children, className, style }: Props) {
  return (
    <div data-scroll data-scroll-speed={speed} className={className} style={style}>
      {children}
    </div>
  );
}
