import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // Build time: every deploy (a push to main) refreshes it.
  const lastModified = new Date();
  return [
    { url: absoluteUrl(), priority: 1.0 },
    { url: absoluteUrl("press/"), priority: 0.5 },
    { url: absoluteUrl("privacy/"), priority: 0.3 },
    { url: absoluteUrl("terms/"), priority: 0.3 },
    { url: absoluteUrl("acknowledgements/"), priority: 0.2 },
  ].map((e) => ({ ...e, lastModified }));
}
