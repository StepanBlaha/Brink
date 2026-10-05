import { motion } from "motion/react";
import { contents, instant } from "../../theme/motion";
import type { NotchEdge, Rect } from "./notchGeometry";
import type { PillStyle } from "../../theme/notchMetrics";

interface Props {
  rect: Rect;
  edge: NotchEdge;
  style: PillStyle;
  ratio: number | null;
  s: number;
  visible: boolean;
  reduce: boolean;
}

/** Live pill progress (NotchRootView pillProgress): accent fill growing from the bottom / left. */
export function PillProgress({ rect, edge, style, ratio, s, visible, reduce }: Props) {
  if (ratio === null || (style !== "line" && style !== "percent")) return null;
  const top = edge === "top";
  const wash = style === "percent";
  const thick = wash ? (top ? rect.height : rect.width) : Math.max(2, 3 * s);
  const along = (top ? rect.width : rect.height) * Math.min(Math.max(ratio, 0), 1);
  const box = top
    ? { left: rect.x, top: rect.y + rect.height / 2 - thick / 2, width: along, height: thick }
    : { left: rect.x + rect.width / 2 - thick / 2, top: rect.y + rect.height - along, width: thick, height: along };
  return (
    <motion.div
      style={{ position: "absolute", background: "var(--accent)" }}
      initial={false}
      animate={{ ...box, opacity: visible ? (wash ? 0.4 : 0.7) : 0 }}
      transition={reduce ? instant : contents}
    />
  );
}
