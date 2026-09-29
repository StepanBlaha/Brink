import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-09-29");
  return [
    { url: absoluteUrl(), priority: 1.0 },
    { url: absoluteUrl("press/"), priority: 0.5 },
    { url: absoluteUrl("privacy/"), priority: 0.3 },
    { url: absoluteUrl("terms/"), priority: 0.3 },
    { url: absoluteUrl("acknowledgements/"), priority: 0.2 },
  ].map((e) => ({ ...e, lastModified }));
}
