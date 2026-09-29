/** Single source of truth for every URL, contact and tagline on the site. */
export const site = {
  name: "Brink",
  baseUrl: "https://stepanblaha.github.io/Brink",
  basePath: "/Brink",
  contactEmail: "stepa15.b@gmail.com",
  downloadUrl: "https://github.com/StepanBlaha/Brink/releases/latest",
  repoUrl: "https://github.com/StepanBlaha/Brink",
  price: "Free",
  version: "0.9.0",
  author: "Stepan Blaha",
  year: 2026,
  tagline: "Your pages, on the edge.",
  shortDescription:
    "A black notch on your Mac's screen edge that keeps your Notion pages and tasks one hover away.",
  disclaimer:
    "Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc.",
  trademark: "“Notion” is a trademark of Notion Labs, Inc.",
  taglines: [
    "Your pages, on the edge.",
    "One hover from done.",
    "Notion tasks without opening Notion.",
    "Check it off. Stay in flow.",
  ],
} as const;

/** Prefix a public/ path with the basePath (for <img>, <video>, raw <a href>). */
export function asset(path: string): string {
  return `${site.basePath}/${path.replace(/^\/+/, "")}`;
}

/** Absolute URL on the deployed site; path is relative to the site root. */
export function absoluteUrl(path = ""): string {
  return `${site.baseUrl}/${path.replace(/^\/+/, "")}`;
}
