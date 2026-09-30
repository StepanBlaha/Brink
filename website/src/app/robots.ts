import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/site";

export const dynamic = "force-static";

// A plain-language summary for LLM crawlers lives at /llms.txt (llmstxt.org).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: absoluteUrl("sitemap.xml") };
}
