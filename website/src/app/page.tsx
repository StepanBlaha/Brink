import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { homeJsonLd } from "@/lib/jsonld";
import { site } from "@/site";
import { JsonLd } from "@/components/JsonLd";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Stats } from "@/components/Stats";
import { SeeItForReal } from "@/components/SeeItForReal";
import { PrivacySection } from "@/components/PrivacySection";
import { Faq } from "@/components/Faq";
import { DownloadSection } from "@/components/DownloadSection";

export const metadata: Metadata = pageMetadata({
  title: "Brink: a menu bar and notch app for your Notion pages on Mac and Windows",
  absoluteTitle: true,
  description:
    "Brink is a black notch on your Mac or Windows screen edge that keeps your Notion pages and tasks one hover away. Quick capture, a Notion-style editor, widgets and badges. macOS 14+ and Windows 10/11.",
  path: "",
  ogTitle: `Brink: ${site.tagline}`,
  ogDescription: site.shortDescription,
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={homeJsonLd} />
      <Hero />
      <Stats />
      <Features />
      <SeeItForReal />
      <PrivacySection />
      <Faq />
      <DownloadSection />
    </>
  );
}
