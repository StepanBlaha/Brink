import { absoluteUrl, site } from "@/site";

export const dynamic = "force-static";

/** llms.txt (llmstxt.org): a concise, machine-readable summary of the site. */
export function GET() {
  const body = `# ${site.name}

> ${site.shortDescription} ${site.tagline}

Key facts:
- Runs on macOS 14 or later.
- ${site.price}. No account, no subscription.
- Works with Notion through an internal integration that you create and control.
- Privacy: no analytics, no tracking, no server. Your data goes only between your Mac and the Notion API.

${site.disclaimer} ${site.trademark}

## Pages

- [Home](${absoluteUrl()}): what Brink does, features, privacy and FAQ
- [Press kit](${absoluteUrl("press/")}): name usage, descriptions, icons, colors and facts
- [Privacy Policy](${absoluteUrl("privacy/")}): what Brink stores and sends
- [Terms of Use](${absoluteUrl("terms/")}): terms for using the app
- [Acknowledgements](${absoluteUrl("acknowledgements/")}): third-party notices and credits

## Links

- [Download](${site.downloadUrl}): latest release on GitHub
- [Source](${site.repoUrl}): GitHub repository
- [Sitemap](${absoluteUrl("sitemap.xml")})
- Contact: ${site.contactEmail}
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
