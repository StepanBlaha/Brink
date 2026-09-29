import type { MetadataRoute } from "next";
import { asset, site } from "@/site";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.name,
    description: site.tagline,
    start_url: `${site.basePath}/`,
    scope: `${site.basePath}/`,
    display: "browser",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: asset("assets/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: asset("assets/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
}
