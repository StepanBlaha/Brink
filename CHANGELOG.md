# Changelog

## 0.11.2 — 2026-10-06

### Fixed
- Apple Notes: titles and headings keep their style when you edit a note in Brink. Before, the first line of a note turned into plain bold text after the first save.
- Apple Notes: "&", "<", ">" and quotes show up correctly instead of as "&amp" or "&lt".
- Apple Notes: editing a note no longer reports "Changed in Notes while you were editing" on every second save.
- Apple Notes: monospaced text keeps its style, and a numbered list right after a bulleted list stays numbered.
- Apple Notes: links added by quick capture are written as plain addresses, so the note stays editable in Brink instead of turning read-only.
- Apple Notes: search and pinned notes no longer show notes from Recently Deleted, in any language of macOS.
- Apple Notes: folders with the same name in different accounts now show which account they belong to, and "Use Notes' version" no longer leaves an empty editor if a refresh is running.
- Apple Notes: a slow answer from Notes now says so instead of showing a raw error.

## 0.11.1 — 2026-10-05

### Fixed
- Brink now saves a local backup of a page before any save that removes blocks, so an accidental delete can be recovered. The newest 20 backups per page are kept in the app's support folder.
- "Today", "Before today" and "Next 7 days" filters now use your local day instead of UTC, so they no longer flip a few hours early or late near midnight.
- Slow or dropped connections no longer stall saving. Requests time out after 30 seconds and retry on their own, with more patience when Notion asks to slow down.

## 0.11.0 — 2026-10-05

### New
- **Apple Notes.** Use Brink with Apple Notes as well as Notion. Pin a Notes folder or a single note, read and edit notes in the panel, add notes that sync to your iPhone through iCloud, and capture into Notes with ⌥⇧Space. Connect it in Settings → Connection. Notes with tables or attachments open read-only, with "Open in Notes".
- **Open a task as a page.** Click a database task (or the arrow on hover) to open its page in the panel, with a back button and "Open in Notion". Also from the Today view, the hover peek and the menu-bar list. Rename moved to right-click.

### Fixed
- ⌥⌘V (paste into the last page) now finds the page you opened last.

## 0.10.0 — 2026-09-30

### New
- **Today view.** A ☀️ Today pin at the top of the strip collects every open task due today or overdue across your database pins, grouped by pin, with overdue items in red. Tick, snooze or change the date in place. Turn it off in Settings → General.
- **Due reminders.** macOS notifications for tasks with a due date, with Mark done, Snooze 1 hour and Open buttons, plus an optional morning summary. The notch can peek open when a reminder fires. Set it up in Settings → General → Reminders.
- **Connect to Notion.** One-click sign-in with Notion's own page picker, as an alternative to pasting an integration token. It appears once the public integration is configured.

### Improved
- The add-a-pin flow has a proper header and back button, compact Notion-style rows and consistent spacing.
- Brink is now open source under the MIT License. The name and icon stay protected (TRADEMARKS.md).

## 0.9.0 — 2026-09-29 (first release candidate)

### Notch
- One morphing black notch: resting pill → hover strip → expanded panel. It has concave flares, springs open and closed as mirror images, and honors Reduce Motion.
- It can sit on the left, right or top edge. The top position works next to or merged with the MacBook hardware notch. You can choose the display.
- Pill styles are Hidden, Dot, Line and Percent, with a live progress fill. Badges show open or due-today counts.
- Hover peek shows the next 3 items, and you can tick them in place.
- The panel size is resizable and remembered per pin. Size presets, accent colors and sounds are available.

### Pages and tasks
- A Notion-style WYSIWYG editor that keeps one line equal to one Notion block. Saving uses exact block identity, so empty lines are kept.
  - Markdown shortcuts and inline formatting convert as you type, and ⌘Z restores the literal text you typed.
  - Also includes a slash menu, toggles, callouts, ⌘F find, a cover strip, pasted and dropped images (Notion file uploads), and drag or ⌥⇧↑↓ to reorder lines.
  - A safety check confirms before a single save deletes most of a page.
- Database pins have a full task list with quick add, dates, snooze and saved filters and sorts.

### Capture and glance
- Quick capture (⌥⇧Space) understands natural dates in English and Czech. ⌥⌘V appends the clipboard to the last page.
- A menu-bar mini-list, a desktop widget with interactive checkboxes, and "Send to Brink" in the Share menu.
- Rebindable global hotkeys (⌥Space, ⌥1–9).

### Organization
- Pins can be reordered by dragging, grouped, and given custom icons (emoji, SF Symbol or letter, optionally synced to Notion).

### Product
- The app is renamed to Brink, with an app icon, brand guide, privacy policy, terms and notices. It also has an About window and first-run onboarding.
- Offline-safe write queue, request rate limiting, and caching for instant open.
