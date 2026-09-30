# Brink: Mac App Store listing

Character limits are checked; see the counts in brackets. Base URL and contact are placeholders (see LAUNCH.md checklist).

## Name (max 30)
`Brink` [5]

## Subtitle (max 30)
`Your pages, on the edge.` [24]

## Promotional text (max 170)
`Hover the notch, tick the task. Brink keeps your Notion pages and tasks one hover away, with quick capture on Option-Shift-Space from any app.`

## Description (max 4000)
```
Brink is a quiet black notch on the edge of your screen that keeps your Notion pages and tasks one hover away.

Rest your cursor on the notch and a strip of your pinned pages unfolds. Click and it grows into a panel where you can check off tasks, add items and edit text, without opening Notion. Resting pill, strip and panel are one morphing shape with a smooth spring, and it honors Reduce Motion.

HOVER PEEK
See your next tasks and badges at a glance, then move on.

QUICK CAPTURE
Press Option-Shift-Space in any app, type, press return. Natural dates work in English and Czech: "tomorrow 5pm", "friday", "zítra v 17:00".

A NOTION-STYLE EDITOR
Pages render white on black and edit like one Markdown document where each line is one block. Type / for the slash menu: headings, to-dos, toggles, callouts and more. Find in page with Command-F.

BADGES AND A LIVE PILL
See what is due today right on the pill. Updates arrive quietly in the background.

MENU-BAR MINI-LIST
A compact task list in the menu bar for when you prefer the top of the screen.

DESKTOP WIDGET
Keep your task list on the desktop or in Notification Center.

SEND TO BRINK
A share extension for every app: send a link, selection or file to a page or database.

HOTKEYS
Global shortcuts for quick capture and for opening your last pin. Rebind them in Settings.

GROUPS AND SAVED VIEWS
Group pins into folders. Pin a filtered and sorted database view, such as "My open tasks by due date", and check things off without opening the whole database.

MAKE IT YOURS
Choose the edge (left, right or top), the display, the pill style, the size (Small, Medium, Large), an accent color and sounds. Launch at login and auto-hide are built in.

WORKS OFFLINE
Pages are cached so the panel opens instantly. Edits made offline are queued and synced when you are back online.

PRIVATE BY DESIGN
Your data stays between your Mac and Notion. Your token lives in the macOS Keychain. Brink has no server, no analytics and no tracking.

REQUIREMENTS
macOS 14 or later and a Notion internal integration (you create it in Notion and share the pages you want with it).

Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc. "Notion" is a trademark of Notion Labs, Inc.
```

## Keywords (max 100 chars, comma-separated, no spaces)
Do not repeat the app name or category; Apple indexes those already.
```
notion,tasks,todo,widget,menubar,notch,capture,pages,hotkey,checklist,reminders,dock,edge,sidebar
```
[97 chars]
Note: "notion" in keywords is descriptive but review-sensitive. Decide with the trademark advice in LAUNCH.md; if in doubt, drop it and use `productivity` synonyms.

## What's New: 0.9.0
```
First public release. Hover peek, quick capture (Option-Shift-Space) with natural dates in English and Czech, a Notion-style editor with slash menu, badges and a live pill, menu-bar mini-list, desktop widget, Send to Brink share extension, pin groups and saved database views, and full customization of edge, display, pill style, size, accent color and sounds.
```

## Categories
- Primary: Productivity
- Secondary: Utilities

## Age rating answers
All "None" / "No": cartoon or fantasy violence, realistic violence, sexual content, profanity, horror, mature themes, alcohol/tobacco/drugs, gambling, contests, medical advice, unrestricted web access (Brink loads only Notion API content the user chose), user-generated content shared between users (No: content is the user's own Notion workspace). Expected rating: **4+**.

## App Privacy: "Data Not Collected"
- Brink has no server of its own; the developer receives nothing.
- The Notion token is stored only in the macOS Keychain on the device; pins, cache and settings are stored locally.
- Brink talks only to api.notion.com (and Notion's file URLs) to show the user's own content. This is user-directed transfer to a third-party service the user chose, not collection by the developer.
- No analytics, advertising, crash reporting or telemetry SDKs. No third-party packages.
- Diagnostic logs go to the local macOS unified log and are never transmitted.
- Answer every data-type question "No" and set the label to **Data Not Collected**. Tracking: **No**.

## URLs (placeholders)
- Support URL: https://github.com/StepanBlaha/Brink/issues
- Marketing URL: https://brinknotch.site/
- Privacy Policy URL: https://brinknotch.site/privacy.html
- Support email: stepa15.b@gmail.com
- Copyright: 2026 Stepan Blaha

## Review notes (suggested)
Brink needs a Notion internal integration token. TODO: create a demo Notion workspace and provide the token plus a test page to App Review, and explain that the app is an independent client and uses only the public Notion API.

## Screenshot shot list (2880x1800, Retina 16:10; up to 10)
Generated by `scripts/record-demo.sh` (demo mode, sample data only) into `marketing/screenshots/`: dusk wallpaper (see `branding/BRAND.md`), clean fake menu bar, black notch on the right edge, captions in white SF Pro.
1. **Hover peek** (`01-hover-peek.png`). Strip unfolded, peek card for "Groceries" with its next items. Caption: "Your pages, on the edge."
2. **Task panel** (`02-task-panel.png`). "Sprint" database panel with status and due dates, cursor on a checkbox. Caption: "Check it off. Stay in flow."
3. **Editor** (`03-editor.png`). "Launch plan" page with a callout, headings, a toggle and ticked to-dos. Caption: "A Notion-style editor, one hover away."
4. **Slash menu** (`04-slash-menu.png`). The "/" menu filtered to To-do. Caption: "Type / for any block."
5. **Quick capture** (`05-quick-capture.png`). "Call Anna tomorrow 5pm" with the parsed "Tomorrow 17:00" chip. Caption: "Capture in under three seconds."
6. **Menu bar** (`06-menu-bar.png`). Menu-bar mini-list with the Sprint section expanded. Caption: "In the menu bar, too."

Not yet recorded (need real system surfaces or Settings): desktop widget, badges/live pill close-up, groups and saved views, customization, privacy card.

Screenshots must show Brink's own UI; do not show the Notion logo as if it were Brink's, and keep "Works with Notion" secondary.
