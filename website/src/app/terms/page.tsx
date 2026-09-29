import { pageMetadata } from "@/lib/metadata";
import { LegalPage } from "@/components/LegalPage";

export const metadata = pageMetadata({
  title: "Terms of Use",
  description: "The terms of use for Brink, an independent Mac app that works with Notion.",
  path: "terms/",
});

export default function Page() {
  return <LegalPage file="TERMS.md" title="Terms of Use" />;
}
