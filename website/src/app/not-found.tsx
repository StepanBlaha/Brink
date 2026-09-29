import Link from "next/link";
import { pageMetadata } from "@/lib/metadata";
import { Prose } from "@/components/Prose";

export const metadata = pageMetadata({
  title: "Page not found",
  description: "This page does not exist.",
  path: "404.html",
  noindex: true,
});

export default function NotFound() {
  return (
    <Prose title="Page not found">
      <p>That page is not on the edge. Try the <Link href="/">home page</Link>.</p>
    </Prose>
  );
}
