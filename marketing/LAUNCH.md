# Brink launch kit

**Current facts** (keep posts consistent with these):
- **What it is:** a quiet notch on the edge of your Mac's screen that keeps your Notion pages and tasks one hover away, on Mac and Windows.
- **Price and license:** free, open source (MIT).
- **Requirements:** macOS 14+ (Mac 0.11.2) or Windows 10 (22H2) / 11, x64 and ARM64 (Windows 0.11.1), and it works with Notion through your own integration token.
- **Features:** hover peek with ticking in place, a Notion-style editor (Markdown turns into blocks as you type), a Today view, due reminders, quick capture (⌥⇧Space, dates in English and Czech), a menu-bar list, a desktop widget, "Send to Brink" in the Share menu, tasks that open as a page, and Apple Notes (Mac only).
- **Privacy:** no account, no analytics, no tracking. The token is kept in the Keychain.
- **Links:** site https://brinknotch.site · repo https://github.com/StepanBlaha/Brink · download https://github.com/StepanBlaha/Brink/releases/latest · Homebrew `brew trust stepanblaha/tap` once on newer Homebrew, then `brew install --cask stepanblaha/tap/brink`. No winget yet.
- **Not notarized / not signed yet:** on Mac first launch needs right-click → Open. On Windows SmartScreen shows "More info → Run anyway". Say it up front.
- **Always include:** "Brink is an independent app, not affiliated with Notion."

**Media:**
- `marketing/social/brink-square-1080.mp4`: square video for X, Threads, LinkedIn, Instagram
- `website/public/assets/media/hero.mp4`: 16:10 video
- `marketing/media/*.gif`: GIFs for Reddit and HN comments
- `marketing/screenshots/*.png`: Product Hunt gallery, 2880×1800

**Voice:** calm, short, honest. Tell the story. No hype words, no exclamation marks, no asking for upvotes.

---

## 1. Product Hunt

**Where:** https://www.producthunt.com/posts/new. Make a free maker account a few days before.

**When:** Tuesday, Wednesday or Thursday. Submit so it goes live at **00:01 Pacific**, which is **09:01 Prague time** in summer and 08:01 in winter. Stay online that whole day to reply.

**How:**
1. **Name:** Brink
2. **Tagline** (max 60 chars): `Your Notion pages and tasks, one hover away on your Mac`
3. **Links:** https://brinknotch.site, plus https://github.com/StepanBlaha/Brink as an extra link.
4. **Topics:** Mac, Productivity, Open Source, Notion, Task Management.
5. **Thumbnail:** `branding/icon-1024.png` (upload a 240×240 export).
6. **Gallery**, in this order:
   1. the hero GIF (make it from `hero.mp4`, or upload `peek-tick.gif`)
   2. `01-hover-peek.png`
   3. `03-editor.png`
   4. `02-task-panel.png`
   5. `05-quick-capture.png`
   6. `06-menu-bar.png`
7. **Pricing:** Free. Tick "Open source" if the form offers it.
8. **Description** (max 260 chars):

```
Brink is a quiet black notch on your Mac's screen edge. Hover it to peek at your Notion pages and tasks, tick things off in place, capture a task from any app with a hotkey, and see what's due today. Free and open source.
```

**Maker comment** (post it within the first minute):

```
Hi Product Hunt 👋

I kept opening Notion 30 or 40 times a day just to check one task list, tick something off and close it again. So I built Brink: a small black notch on the edge of my screen.

• Hover it → your pinned pages unfold; hover a pin to peek at the next tasks and tick them right there
• Click a pin → a compact panel with a Notion-style editor. Type Markdown and it turns into real blocks as you go
• ⌥⇧Space from any app → quick capture ("call Anna tomorrow 5pm" sets the date)
• A Today view and due reminders across your Notion databases
• Also a menu-bar list, a desktop widget and "Send to Brink" in the Share menu

It's native Swift, free and MIT open source. There's no account and no tracking: your token stays in the Keychain and Brink only talks to Notion.

Honest note: it isn't notarized or signed yet. On Mac, right-click → Open the first time. On Windows, SmartScreen: More info → Run anyway.

I'd love to hear what you'd pin first and what's missing.

(Brink is an independent app, not affiliated with Notion.)
```

**That day:** reply to every comment within an hour. Thank people, and answer questions concretely. If someone reports a bug, say "fixing it today" and ship 0.11.x.

---

## 2. Show HN

**Where:** https://news.ycombinator.com/submit. You need an account, ideally with a little history, so make it a week before and comment on a few threads.

**When:** a weekday at **14:00–16:00 Prague** (8–10 am US East). It can be the same day as Product Hunt or the day after.

**Title:**
```
Show HN: Brink, a notch on your Mac's screen edge for Notion pages and tasks
```
**URL:** `https://github.com/StepanBlaha/Brink`. HN prefers the repo for open-source projects.

**First comment** (post it right after submitting):

```
Hi HN, I built Brink because I was opening Notion dozens of times a day just to tick one task.

It's a native macOS app (Swift, AppKit plus SwiftUI) that draws a black notch on a screen edge. Hover to unfold your pinned pages, click to open a small panel, and edit or tick tasks there. It talks to the Notion API directly with your own integration token (Keychain), with no server, account or analytics.

Some technical bits that were fun:
- The notch is one SwiftUI shape with concave "flares" that morphs pill → strip → panel with a spring; the window stays click-through outside the shape.
- The page editor keeps a 1 paragraph = 1 Notion block identity in NSTextStorage attributes, so edits map to minimal API ops (update, append-after, delete) instead of diffing Markdown. Markdown shortcuts convert as you type.
- Writes go through a persisted queue with rate limiting (the Notion API allows about 3 req/s) and retries, so offline edits aren't lost.
- There's a widget and a Share extension, which share data through an App Group; the token never leaves the main app.

It's free and MIT licensed. It isn't notarized or signed yet (Mac: right-click → Open the first time; Windows: SmartScreen, More info → Run anyway). Feedback on the sync approach is very welcome.

Not affiliated with Notion.
```

**Tips:** answer every question, technical detail welcome. Take criticism calmly ("fair point, I'll look at it"). Don't ask anyone to upvote: HN detects voting rings and kills the post.

---

## 3. Reddit: r/macapps

**Where:** https://www.reddit.com/r/macapps/submit. Read the sidebar rules first. Developers usually must disclose they made the app, and there may be a flair such as "Free" or "Developer".

**When:** day 2, around 15:00–17:00 Prague (morning in the US).

**Post type:** video post (upload `brink-square-1080.mp4` or `hero.mp4`) with text, or a text post with the GIF.

**Title:**
```
[Free, open source] I made Brink: a notch on your screen edge for your Notion pages and tasks
```

**Body:**
```
Hi r/macapps, I'm the developer. I built Brink because I kept opening Notion just to tick one task.

It's a small black notch on your screen edge (left, right, or top next to the hardware notch):
• hover → your pinned pages; hover a pin to peek and tick tasks in place
• click → a compact panel with a Notion-style editor (Markdown turns into blocks)
• ⌥⇧Space → quick capture from any app, with natural dates
• Today view and due reminders, menu-bar list, desktop widget, Share extension
• lots of options: edge, display, pill style, size, accent, hotkeys, groups

Native Swift on Mac, plus Windows 10/11, free and MIT open source, no tracking.
Download: https://brinknotch.site (or brew install --cask stepanblaha/tap/brink, after `brew trust stepanblaha/tap`)

It's not notarized yet, so on Mac right-click → Open the first time. On Windows, SmartScreen: More info → Run anyway.
Not affiliated with Notion. Happy to hear feedback.
```

---

## 4. Reddit: r/Notion

**Where:** https://www.reddit.com/r/Notion/submit. Check the rules: self-promotion is often limited to a weekly thread or a specific flair. If it's only allowed there, post in that thread.

**When:** day 2 or 3.

**Title:**
```
I got tired of opening Notion 40x a day to tick one task, so I built a free Mac notch for it
```

**Body:**
```
My Notion setup is great, but I kept opening the whole app just to check a task list, tick one thing and close it again.

So I built Brink, a free and open-source Mac app. It adds a small notch on your screen edge with the Notion pages you pin:
• hover to peek at a page's next tasks and tick them without opening anything
• click for a compact editor that works like Notion (/ menu, Markdown shortcuts, toggles, callouts)
• pin databases with your own filters and sorts ("This week", "Inbox")
• a Today view plus reminders for tasks with due dates
• quick capture from any app with a hotkey

It uses your own Notion integration token (you share only the pages you want), with no account or tracking.
https://brinknotch.site

It's an independent app, not affiliated with Notion. Would love to know what you'd pin first.
```

---

## 5. Also worth a post (optional)

| Where | Angle | When |
|---|---|---|
| **r/opensource, r/swift, r/SwiftUI** | The technical story (notch morph animation, editor block sync). Link the repo. | Day 3+ |
| **X / Bluesky / Threads / Mastodon** | Square video + "I kept opening Notion 40x a day… so I built a notch. Free and open source → brinknotch.site". Hashtags #buildinpublic #macOS #indiedev #Notion | Launch day, then a thread with 3–4 GIFs over the week |
| **LinkedIn (Czech)** | A personal story in Czech, with the video. | Launch week |
| **Indie Hackers** | "Launched my first Mac app", with numbers after a week. | Week 2 |
| **Czech media** (Lupa.cz, Živě.cz, CzechCrunch) | A short email with the video: a Czech-made open-source Mac app for Notion users. | Week 2 |

**X / Bluesky post:**
```
I kept opening Notion 40x a day just to tick one task.

So I built Brink: a quiet notch on your Mac's screen edge. Hover to peek, tick in place, capture from anywhere.

Free + open source → brinknotch.site
```

---

## After launch

- **Within 48 h:** fix the top reported issues, ship 0.11.x, and post "thanks, fixed X and Y" in each thread.
- **Metrics:** GitHub release downloads, stars and issues, and your Product Hunt rank. Brink has no analytics.
- **Directories:** submit to the lists in `marketing/LISTINGS.md` over the following weeks.
