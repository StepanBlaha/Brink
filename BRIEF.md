# Notion Dock — Project Brief

> Working name. A native macOS side strip that keeps your most-used Notion pages one click away, so you stop opening and closing Notion just to check tasks.

**Status:** Brief / pre-build · **Owner:** Stepan · **Date:** 2026-09-28

---

## 1. Problem

I keep opening Notion, going to the same tab (my task list), checking something off or adding a task, and closing it again, many times a day. Each round trip means switching context and waiting for a heavy app, only to do a 5-second action.

## 2. Solution in one paragraph

A thin strip docked to the edge of the screen that is always visible and floats above other windows. It shows icons for the Notion pages and databases I've pinned. Clicking an icon slides out a compact panel where I can work in that page: check off tasks, add new ones, change status or date, and make light edits to page text. Clicking away collapses it back to the strip. No browser, no full Notion window.

## 3. Locked v1 decisions

| Area | Decision |
|---|---|
| Form factor | **Edge-docked side strip** of pinned-item icons. Click → panel slides out. Always visible, floats above other windows. |
| What can be pinned | **Notion pages and databases only.** No local files or URLs in v1. |
| Editing depth | **Task-first.** Databases get a full task view; pages get read access plus light editing. No full Notion-style editor. |
| Audience | **Just me.** Personal tool, not a product. |
| Stack | **Native Swift + SwiftUI** (AppKit where needed for window behavior). |
| Auth | **Notion internal integration token**, pasted once, stored in the macOS Keychain. No OAuth. |
| Distribution | Built and run locally from Xcode or a local archive. No App Store, no notarization. |

## 4. Core features (v1)

### 4.1 The strip
- Vertical strip docked to one screen edge (right by default, left as a setting).
- One icon per pinned item: its Notion emoji/icon, or its first letter as a fallback. Hovering shows a tooltip with the title.
- Optional badge on database items, e.g. the count of open tasks due today.
- Floats above normal windows, shows on every Space, and stays visible over full-screen apps.
- Setting: always visible, or auto-hide into a 2–4 px sliver that reveals on hover at the edge.
- Drag icons to reorder them. Right-click an icon for Unpin / Open in Notion / Refresh.
- A "+" at the bottom to pin a new item.

### 4.2 The expanded panel
- Slides out from the strip, about 360–420 pt wide and resizable. Width is remembered per item.
- Click outside or press Esc to collapse. A pin toggle keeps it open.
- Header: title, refresh, "Open in Notion" (deep link `notion://`), close.

### 4.3 Database / task view (the main use case)
- Rows of the database, filtered and sorted by a per-pin view config. Default: not done, sorted by date.
- **Checkbox or Status toggle** to mark a task done, using whichever property the database has, mapped at pin time.
- **Quick add** field at the top: type a title, hit Enter, and the row is created. Nice to have: light inline parsing like `tomorrow` or `!high`.
- Inline edit of title, status/select, date, and checkbox. Other property types are shown read-only.
- Toggle for showing done items. Group by status (optional).

### 4.4 Page view (light editing)
- Renders common blocks: paragraph, headings, to-do, bulleted/numbered list, toggle (collapsed), quote, callout, divider, code. Unsupported blocks show as a gray placeholder with an "Open in Notion" link.
- **Editable:** text of paragraph/heading/to-do/list blocks, checking to-dos, and appending a new block at the end (paragraph or to-do).
- Not editable in v1: reordering blocks, tables, embeds, images, and nested structure changes.

### 4.5 Pinning flow
- "+" opens a search box that queries the Notion search API across the pages the integration can see.
- Choose a result → it is pinned. For a database, a quick setup step asks which property means "done", which is the date, and the default filter.

### 4.6 Global
- Global hotkey (e.g. ⌥Space) opens the first pin, or a quick switcher over all pins.
- Menu bar icon for settings, quit, and launch at login. The strip itself is the main UI.
- Launch at login (SMAppService).

## 5. Non-goals (v1)

- Local files, URLs, or other apps (Todoist, Linear, …).
- A full Notion block editor, including drag-to-reorder blocks, tables, databases inside pages, and media upload.
- Multiple Notion workspaces.
- OAuth, onboarding, accounts, sync across machines, public distribution.
- iOS or Windows.

## 6. Technical notes

### 6.1 Notion API
- **Internal integration:** create it at notion.so/my-integrations and paste the token into settings. **Each page/database must be shared with the integration** (page → ••• → Connections). The app should explain this when search returns nothing.
- **Use the current API version (2025-09-03+):** databases now contain *data sources*. Query rows via `POST /v1/data_sources/{id}/query` and create rows with a `data_source_id` parent. Don't build against the old `/databases/{id}/query` model.
- **Rate limit:** about 3 requests/second on average. All calls go through one serial request queue with backoff on `429` (respect `Retry-After`).
- **Block editing:** `PATCH /v1/blocks/{id}` updates a single block's text or checked state. `PATCH /v1/blocks/{id}/children` appends. Each rich-text object is limited to 2000 chars.
- **No push for a local app:** Notion webhooks need a public endpoint, so refresh by **polling**. Refetch when a panel opens, poll the open panel every ~30–60 s, and refresh badge counts in the background every few minutes.

### 6.2 macOS window behavior
- Strip and panel are `NSPanel` subclasses hosting SwiftUI views:
  - `.nonactivatingPanel` style, so clicking the strip doesn't steal focus from the current app. Override `canBecomeKey` so text fields in the panel can still take typing.
  - `level = .floating` (or `.statusBar`), `collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]`.
- App runs as an agent (`LSUIElement = YES`): no Dock icon, no app switcher entry.
- Recalculate position on screen changes (`NSApplication.didChangeScreenParametersNotification`). v1 docks on the main screen, with a setting to choose the display.
- Collapse on outside click via a global event monitor for mouse-down outside the panel.

### 6.3 Data and state
- **Min target:** macOS 14 (Observation, SwiftData).
- **Token:** Keychain only.
- **Pins and settings:** small local store (SwiftData or a JSON file) holding the pin list, order, per-pin view config, and panel widths.
- **Cache:** last-fetched rows and blocks per pin, so the panel opens instantly and then refreshes.
- **Optimistic updates:** a check-off or add updates the UI immediately and is queued to the API. On failure it rolls back with a small inline error and a retry. The queue survives app restart.

### 6.4 Suggested structure
```
NotionDock/
  App/            // entry point, AppDelegate, LSUIElement, login item
  Windows/        // StripPanel, ExpandedPanel (NSPanel subclasses), positioning
  Features/
    Strip/        // icon list, reorder, badges
    DatabaseView/ // rows, quick add, inline edit, property mapping
    PageView/     // block rendering + light editing
    Pinning/      // search + database setup sheet
    Settings/
  Notion/         // API client, request queue, models (Page, DataSource, Block, Property)
  Store/          // pins, settings, cache, pending-write queue
```

## 7. Milestones

1. **Skeleton:** agent app, docked `NSPanel` strip with fake icons, slide-out panel, collapse on outside click, and correct Spaces/full-screen behavior. *Proves the window feel, the riskiest part UX-wise.*
2. **Notion connection:** token in Keychain, API client with rate-limited queue, search, and pinning. Real titles and icons appear on the strip.
3. **Task view:** query a data source, property mapping, check off, quick add, inline edit of status/date, optimistic writes. *At this point it replaces the daily Notion round trip.*
4. **Page view:** block rendering, text/to-do editing, append.
5. **Polish:** polling and badges, global hotkey, auto-hide, reorder, launch at login, settings screen, offline/error states.

## 8. Success criteria

- Checking off or adding a task takes **under 3 seconds** from any app, without Notion open.
- The panel opens **instantly** from cache, with fresh data within about 1 s.
- After two weeks of daily use I've stopped opening Notion just to check tasks.
- Idle RAM stays small (target under 80 MB) and CPU near zero when collapsed.

## 9. Open questions (decide when we get there)

- Is quick-add natural-language date parsing worth it in v1, or should it wait?
- Badge meaning: tasks due today, open count, or configurable per pin?
- Should the strip show a mini preview on hover, like the next 3 tasks?
- Auto-hide sensitivity and how it behaves when the dock edge is next to a second monitor.
- Hotkey: open the last-used pin, or always show a switcher?

## 10. Status and roadmap

**Product: Brink** (renamed from Notion Dock, because "Notion" can't be in the name). The code module, bundle id and storage paths keep the old NotionDock name so existing installs keep their data. See `branding/BRAND.md` for the brand, `legal/` for the policies, `CHANGELOG.md` for release notes and `README.md` for the build.

**Design:** Codenotch-style black notch. The resting pill, the hover strip and the expanded panel are one morphing shape. Content is white-on-black Notion-style WYSIWYG, where one line is one block.

**Shipped in 0.9.0:** everything in the changelog. That's the notch (left/right/top edge, display choice, pill styles, badges, live pill, hover peek with ticking, per-pin size, sounds, launch at login); the editor (WYSIWYG, slash menu, toggles and callouts, find, cover, images, line reorder); tasks (saved filters and sorts, snooze, natural dates); capture (quick capture, clipboard, Share extension); glance (menu-bar mini-list, widget); organization (groups, reorder, custom icons); hotkeys; plus the About window, onboarding, website, SEO and store copy.

**Still open:** the view editor UI for database pins, a git history (nothing is committed yet), a trademark search, the domain, a contact email, notarized distribution and pricing.

**Backlog ideas:**
- Due reminders and an end-of-day review
- A Today view
- A pomodoro timer for a task
- @mentions
- Recurring tasks
- Change history and undo
- Offline indicator
- Themes (graphite and glass)
- Font choice
- Animation speed
- Per-app full-screen rules
- Multiple workspaces
- iPhone companion
