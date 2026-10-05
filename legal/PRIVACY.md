# Brink Privacy Policy

_Last updated: 2026-10-05_

Brink is a Mac and Windows app that shows your Notion pages and tasks in a notch at the edge of your screen. It is built to keep your data on your computer.

## What Brink stores

| Data | Where it is stored | Why |
|---|---|---|
| Your Notion credential: an OAuth access token and refresh token (Connect to Notion), or a pasted integration token | macOS Keychain (service `cz.stepanblaha.notiondock`) | To call the Notion API on your behalf |
| Workspace name and icon (Connect to Notion only) | macOS Keychain, next to the token | To show which workspace is connected |
| Your pins, groups, icons and saved views | `~/Library/Application Support/NotionDock/` | To remember what you pinned |
| Cached page content, rows, covers and images | `~/Library/Application Support/NotionDock/cache/` | So the panel opens instantly |
| Unsynced edits | `~/Library/Application Support/NotionDock/pending.json` | So edits made offline are not lost |
| Settings (accent color, size, shortcuts) | macOS user defaults | To remember your preferences |

## Where your data goes

- Brink talks **only to the Notion API** (`api.notion.com`), to the image and file URLs Notion returns for your own pages, and (only when you use Connect to Notion) to the sign-in relay described below.
- It sends your token and your page content there to read and save your pages, under [Notion's privacy policy](https://www.notion.so/notion/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091).
- **Connect to Notion (sign-in broker):** Notion's sign-in needs a secret that can't safely ship inside an app, so the one-time code exchange goes through a small relay the developer runs on Cloudflare Workers (`brink-auth…workers.dev`). The relay passes Notion's one-time code (or, later, your refresh token) to Notion and returns the new tokens to your Mac. It **stores nothing and logs nothing**: no database, no request logs. It also never sees your pages. Your page content always goes directly between your Mac and `api.notion.com`. Cloudflare processes the connection under [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/). If you paste an integration token instead, the relay is never used.
- **No analytics, tracking, advertising, crash reporting or telemetry.** Apart from that sign-in relay, Brink has no server of its own, and none of your content is sent to its developer.
- **Diagnostic logs:** Brink writes local diagnostic logs to the macOS unified log (subsystem `cz.stepanblaha.notiondock`). They can include block IDs and error messages, but never your token. They stay on your Mac unless you choose to share them.

## Your control

- **Disconnect:** Settings → Connection → Disconnect removes the token, the refresh token and the workspace info from the Keychain.
- **Choose pages:** with Connect to Notion, you pick the pages Brink can see on Notion's consent screen. Connect again at any time to change the selection.
- **Revoke access:** remove the integration in Notion (Settings → Connections), and Brink immediately loses access.
- **Delete all local data:** quit Brink, delete `~/Library/Application Support/NotionDock/`, then remove the Keychain items (or use Disconnect first).

## Brink for Windows

The Windows version works the same way and talks only to the same servers. It stores data here instead:

| Data | Where it is stored |
|---|---|
| Notion credential (access token, refresh token or pasted integration token) and workspace name | Windows Credential Manager, as generic credentials whose target names start with `cz.stepanblaha.brink` |
| Pins, groups, icons, saved views and unsynced edits (`pending.json`) | `%APPDATA%\Brink\` |
| Settings (accent color, size, shortcuts) | `%APPDATA%\Brink\settings.json` |
| Cached page content, rows, covers and images | `%LOCALAPPDATA%\Brink\cache\` |
| Diagnostic logs (local only, never include your token) | `%LOCALAPPDATA%\Brink\logs\` |

- **Disconnect:** Settings → Connection → Disconnect removes the credentials from Credential Manager.
- **Delete all local data:** use Disconnect, uninstall Brink (Settings → Apps → Installed apps; tick the option to delete app data), then delete `%APPDATA%\Brink\` and `%LOCALAPPDATA%\Brink\` if they remain.

## Children

Brink is not directed at children under 13 (16 in the EU).

## Changes

Updates to this policy will be dated above and shipped with the app.

## Contact

Stepan Blaha: stepa15.b@gmail.com. Issues and questions are also welcome at https://github.com/StepanBlaha/Brink/issues
