import Link from "next/link";
import type { Metadata } from "next";
import { Prose } from "@/components/Prose";

/** No canonical here: the same document is served for every missing URL. */
export const metadata: Metadata = {
  title: "Page not found",
  description: "This page does not exist.",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <Prose title="Page not found">
      <p>That page is not on the edge. Try the <Link href="/">home page</Link>.</p>
    </Prose>
  );
}
