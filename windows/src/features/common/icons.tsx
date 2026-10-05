import type { SVGProps } from "react";

/** Lucide paths (ISC) used by pinning and settings; the full catalog arrives with the icon picker (M8). */
function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props} />
  );
}
export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement>) => (<Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>);
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (<Svg {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Svg>);
export const FileTextIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8M16 13H8M16 17H8" /></Svg>
);
export const DatabaseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></Svg>
);
