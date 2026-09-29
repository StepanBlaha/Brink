import { pageMetadata } from "@/lib/metadata";
import { LegalPage } from "@/components/LegalPage";

export const metadata = pageMetadata({
  title: "Privacy Policy",
  description: "Brink's privacy policy: your data stays between your Mac and Notion. No analytics, no tracking, no server.",
  path: "privacy/",
});

export default function Page() {
  return <LegalPage file="PRIVACY.md" title="Privacy Policy" />;
}
