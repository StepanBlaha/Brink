# Changelog

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
