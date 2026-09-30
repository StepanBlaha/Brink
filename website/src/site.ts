const REPO_URL = "https://github.com/StepanBlaha/Brink";

/** Single source of truth for every URL, contact and tagline on the site. */
export const site = {
  name: "Brink",
  /** Public URL used for canonical/og/sitemap. Override with NEXT_PUBLIC_SITE_URL. */
  baseUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://brinknotch.site").replace(/\/+$/, ""),
  /** Path prefix the site is served under. Empty at the root; "/Brink" on GitHub project Pages. */
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  contactEmail: "stepa15.b@gmail.com",
  /** GitHub URLs live only here. The repo is private for now, so releases/issues 404 for visitors until it goes public. */
  repoUrl: REPO_URL,
  releasesUrl: `${REPO_URL}/releases`,
  issuesUrl: `${REPO_URL}/issues`,
  downloadUrl: `${REPO_URL}/releases/latest`,
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

/** Copyright years: "2026" until the build year passes 2026, then "2026-2027". */
export function copyrightYears(): string {
  const now = new Date().getFullYear();
  return now > site.year ? `${site.year}-${now}` : String(site.year);
}

/** Prefix a public/ path with the basePath (for <img>, <video>, raw <a href>). */
export function asset(path: string): string {
  return `${site.basePath}/${path.replace(/^\/+/, "")}`;
}

/** Absolute URL on the deployed site; path is relative to the site root. */
export function absoluteUrl(path = ""): string {
  return `${site.baseUrl}/${path.replace(/^\/+/, "")}`;
}
