# Brink: launch kit

Voice: calm, short, confident, no exclamation marks. Every public post carries the non-affiliation line:
*Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc.*

## Product Hunt
- **Name:** Brink
- **Tagline (max 60):** Your pages, on the edge. [24]
- **Alt tagline:** A notch for your Notion tasks on Mac [37]
- **Topics:** Productivity, Mac, Task Management
- **Description (max 260):**
  A black notch on your Mac's screen edge that keeps your Notion pages and tasks one hover away. Quick capture on a hotkey, a Notion-style editor, widgets, badges. No tracking. Independent app, not affiliated with Notion.
- **Gallery order:** hover-peek loop (GIF/MP4), task panel, quick capture, editor + slash menu, customization.

### First comment (maker)
```
Hi, I'm Stepan, the maker of Brink.

I kept opening Notion just to check one task, and the round trip was the real cost. Brink is a small black notch on the edge of the screen: hover to peek, click to check things off, press Option-Shift-Space to capture from any app (natural dates in English and Czech).

What is in 0.9.0: hover peek, quick capture, a Notion-style editor with a slash menu, badges and a live pill, a menu-bar mini-list, a desktop widget, a Send to Brink share extension, pin groups and saved views, and settings for edge, display, pill style, size, accent color and sounds.

Privacy: your data stays between your Mac and Notion. No server, no analytics, no tracking.

It needs macOS 14+ and a Notion internal integration (a few minutes to set up). Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc.

I would love to hear what would make it a daily driver for you.
```

## Show HN
- **Title:** Show HN: Brink, a notch on your Mac's screen edge for your Notion tasks
- **Body (first comment):** Same as the maker comment above, plus one paragraph on how it works: SwiftUI/AppKit panel, no third-party dependencies, an optimistic write queue over the Notion API with a rate-limited request queue, cache-first rendering so the panel opens instantly. Mention the design inspiration: Codenotch by vinzdg (no code shared). Be ready to answer: pricing (TBD), why not Electron, offline behavior, API limits.

## X / Mastodon
```
Brink is out: a small black notch on your Mac's screen edge that keeps your Notion pages and tasks one hover away.

Hover to peek. Click to tick. Option-Shift-Space to capture from anywhere.

Your pages, on the edge.
[link]

Independent app, not affiliated with Notion Labs, Inc.
```
Attach the hover-peek loop.

## Reddit
### r/macapps
**Title:** I made Brink, a notch on the screen edge for your Notion tasks (macOS 14+)
```
Hi r/macapps. I built Brink because I was opening Notion ten times a day for one checkbox.

It is a black notch on the edge of the screen (left, right or top). Hover to peek at pinned pages, click to open a Notion-style panel where you can tick tasks, edit text and add items. Option-Shift-Space captures a task from any app, with natural dates in English and Czech. There is also a menu-bar mini-list, a desktop widget and a share extension.

Native SwiftUI/AppKit, no tracking, no server: your data goes between your Mac and Notion only. Requires macOS 14+ and a Notion internal integration.

It's free. Feedback very welcome: https://stepanblaha.github.io/Brink/

Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc.
```
### r/Notion
Check the subreddit's self-promotion rules first (often a weekly thread or flair is required). Use the same body, lead with the problem (checking tasks without opening Notion) and state clearly that it is a third-party Mac app that uses the public API.

## Checklist before going public
- [ ] **Domain.** Register one that does not contain "Notion". Set `baseUrl` in `website/site.config.json`, run `website/apply-config.sh`. Confirm og.png, canonical and sitemap URLs.
- [ ] **Trademark search.** USPTO, EUIPO and UPV CZ, class 9 (software), plus class 42. A quick web check on 2026-09-29 found no Mac app named Brink; "Brink's" is an unrelated security company. Consider legal advice.
- [ ] **Rename internals.** Bundle ID `cz.stepanblaha.notiondock` and the NotionDock storage folders still carry the old name; rename only before the first public release (see branding/BRAND.md). Update the legal docs that mention them.
- [ ] **Contact email.** Replace `stepa15.b@gmail.com` (website index/press, legal/PRIVACY.md "Contact") and re-run `python3 website/build-legal.py`.
- [ ] **Signing and notarization.** Developer ID signing, hardened runtime, notarized and stapled DMG (or App Store build). Test on a clean Mac.
- [ ] **Download link.** Replace the `#download` placeholders on the site (hero, download section, nav) and the JSON-LD offer.
- [x] **Pricing.** Free (GitHub Releases).
- [ ] **Notion brand rules.** "Works with Notion" only in plain text and secondary to Brink. Use the official "Made for Notion" badge only if Notion's guidelines and program allow it; unmodified, secondary placement. No Notion logo in the icon, screenshots or social avatars. Keep the non-affiliation line on the site, store listing and every post.
- [ ] **App Store.** Screenshots (2880x1800), review notes with a demo integration token, App Privacy label "Data Not Collected", support URL live.
- [ ] **Assets.** Record the hover-peek loop (10 to 15 s), capture screenshots without personal data.
- [ ] **Analytics stance.** The site uses none; keep it that way to match the privacy claim.
- [ ] **Press kit.** Verify icon downloads and facts (version, price) are current.
- [ ] **Launch day.** Product Hunt scheduled (12:01 am PT), Show HN, Reddit posts spaced and rule-checked, answer comments within the first hours.
