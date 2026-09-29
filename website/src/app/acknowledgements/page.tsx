import { pageMetadata } from "@/lib/metadata";
import { LegalPage } from "@/components/LegalPage";

export const metadata = pageMetadata({
  title: "Acknowledgements",
  description: "Third-party notices and acknowledgements for Brink.",
  path: "acknowledgements/",
});

export default function Page() {
  return <LegalPage file="NOTICE.md" title="Acknowledgements" />;
}
