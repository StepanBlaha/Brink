# Brink Privacy Policy

_Last updated: 2026-09-29_

Brink is a Mac app that shows your Notion pages and tasks in a notch at the edge of your screen. It is built to keep your data on your Mac.

## What Brink stores

| Data | Where it is stored | Why |
|---|---|---|
| Your Notion integration token | macOS Keychain (service `cz.stepanblaha.notiondock`) | To call the Notion API as your integration |
| Your pins, groups, icons and saved views | `~/Library/Application Support/NotionDock/` | To remember what you pinned |
| Cached page content, rows, covers and images | `~/Library/Application Support/NotionDock/cache/` | So the panel opens instantly |
| Unsynced edits | `~/Library/Application Support/NotionDock/pending.json` | So edits made offline are not lost |
| Settings (accent color, size, shortcuts) | macOS user defaults | To remember your preferences |

## Where your data goes

- Brink talks **only to the Notion API** (`api.notion.com`) and to the image and file URLs Notion returns for your own pages.
- It sends your token and your page content there to read and save your pages, under [Notion's privacy policy](https://www.notion.com/notion/privacy).
- **No analytics, tracking, advertising, crash reporting or telemetry.** Brink has no server of its own, so nothing is sent to its developer.
- **Diagnostic logs:** Brink writes local diagnostic logs to the macOS unified log (subsystem `cz.stepanblaha.notiondock`). They can include block IDs and error messages, but never your token. They stay on your Mac unless you choose to share them.

## Your control

- **Remove the token:** Settings → Connection → Remove token.
- **Revoke access:** remove the integration in Notion (Settings → Connections), and Brink immediately loses access.
- **Delete all local data:** quit Brink, delete `~/Library/Application Support/NotionDock/`, then remove the Keychain item.

## Children

Brink is not directed at children under 13 (16 in the EU).

## Changes

Updates to this policy will be dated above and shipped with the app.

## Contact

Stepan Blaha: stepa15.b@gmail.com. Issues and questions are also welcome at https://github.com/StepanBlaha/Brink/issues
