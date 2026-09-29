import type { Metadata } from "next";
import { absoluteUrl, asset, site } from "@/site";

const ogImage = {
  url: absoluteUrl("assets/og.png"),
  width: 1200,
  height: 630,
  alt: "Brink: a notch on the screen edge showing a to-do list",
};

interface PageMeta {
  /** Page title without the " | Brink" suffix (the layout template adds it). */
  title: string;
  /** Use the title verbatim, without the template. */
  absoluteTitle?: boolean;
  description: string;
  /** Path relative to the site root, e.g. "press/" ("" for home). */
  path: string;
  ogTitle?: string;
  ogDescription?: string;
  noindex?: boolean;
}

export function pageMetadata(p: PageMeta): Metadata {
  const url = absoluteUrl(p.path);
  const ogTitle = p.ogTitle ?? p.title;
  const ogDescription = p.ogDescription ?? p.description;
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description: p.description,
    alternates: { canonical: url },
    robots: p.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "website",
      siteName: site.name,
      title: ogTitle,
      description: ogDescription,
      url,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [ogImage.url],
    },
  };
}

export const siteIcons: Metadata["icons"] = {
  icon: [
    { url: asset("favicon.ico"), sizes: "any" },
    { url: asset("assets/favicon-32.png"), type: "image/png", sizes: "32x32" },
  ],
  apple: asset("assets/apple-touch-icon.png"),
};
