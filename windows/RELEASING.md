# Releasing Brink for Windows

Windows releases use tags `win-vX.Y.Z` and never touch the Mac release (`vX.Y.Z`, `scripts/release.sh`).
The workflow only creates a **draft**; you publish by hand.

## Cut a release

1. **Bump the version.** Edit the repo-root `VERSION` (first token, e.g. `0.11.0 (3)`). The Windows build runs
   `npm run sync-version` and writes it into `package.json` and `src-tauri/tauri.conf.json`; commit those too
   (run `cd windows && npm run sync-version`). Windows and Mac share one version number.
2. **Update `CHANGELOG.md`** (Windows subsection) and push to `main`; wait for the `windows` CI to go green.
3. **Tag:** `git tag win-v0.11.0 && git push origin win-v0.11.0`. The tag must equal `win-v` + VERSION or the build fails.
   (For a dry run use Actions, `windows-release`, Run workflow, or `gh workflow run windows-release.yml`; it creates a
   draft `win-v<ver>-dispatch-<n>`. Delete it with `gh release delete <tag> --yes --cleanup-tag`.)
4. **Review the draft** on GitHub: assets `Brink-Setup-<v>-x64.exe`, `Brink-Setup-<v>-arm64.exe`, `SHA256SUMS.txt`.
   Download and smoke-test on Windows (install, Send to Brink, `brink://`, uninstall). Edit the notes.
5. **Publish** the draft. It is created with `latest=false`, so the Mac "latest release" link stays correct; keep it so.
6. **winget:** `windows/packaging/winget/render.sh <v> SHA256SUMS.txt`, validate on Windows, submit
   (`windows/packaging/winget/README.md`).
7. **Website:** in `website/src/site.ts` set `windowsAvailable: true` and make `windowsVersion` and the two
   `windows*Url` values match the published tag. Run `cd website && npm run lint && npm run typecheck && npm run build`,
   push to `main` (pages.yml redeploys). The Download chooser then shows real links and JSON-LD lists Windows.
   Update the FAQ answer "Does Brink work on Windows?" in `website/src/lib/faq.tsx` and `llms.txt`
   (`website/src/app/llms.txt/route.ts`) from "coming soon" to available.

## Signing

The workflow signs only when secrets exist (repo Settings, Secrets and variables, Actions). No secret, no signing.
Never commit a certificate or password.

| Option | Cost | Secrets | Effect |
|---|---|---|---|
| Azure Trusted Signing (preferred) | about $10/month | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `TRUSTED_SIGNING_ENDPOINT`, `TRUSTED_SIGNING_ACCOUNT`, `TRUSTED_SIGNING_PROFILE` | Microsoft-rooted; reputation builds quickly. Needs identity validation (check Czech eligibility). Signs `Brink.exe` and the installer through Tauri `signCommand` with `trusted-signing-cli`. |
| OV certificate (.pfx) | roughly 30 to 250 EUR/year | `WINDOWS_CERTIFICATE` (base64 pfx), `WINDOWS_CERTIFICATE_PASSWORD` | Imported into the runner store, used via `certificateThumbprint`. Vendors now require hardware or cloud keys, so an exportable pfx may not be available; then use the vendor's cloud signing tool instead. SmartScreen reputation accrues slowly. |
| Microsoft Store (MSIX) | about $19 one-time | none | Store installs are trusted and skip SmartScreen. Not built yet (see below). |
| Unsigned | 0 | none | Default. SmartScreen warns. |

## SmartScreen

Unsigned (and newly signed) installers show "Windows protected your PC". Users click **More info**, then **Run anyway**.
Reputation attaches to the signing identity (or, unsigned, to each file hash) and builds as people download without
reporting it; each unsigned version starts again at zero. The warning is not a malware verdict. The Download section
and the draft release notes say this when unsigned.

## What is and is not built

- Built: NSIS per-user installers (x64, arm64), Start menu entry, uninstaller with the "delete app data" option
  (removes `%APPDATA%\Brink` and `%LOCALAPPDATA%\Brink`), "Send to Brink" and `brink://` via `src-tauri/installer/hooks.nsh`.
- Not built: **MSI** (per-machine WiX, no use for it yet; add `"msi"` to `bundle.targets` when IT deployment is wanted),
  **MSIX / Store** (plan 7.2 marks it a stretch: needs `windows/packaging/msix/AppxManifest.xml`, Partner Center identity,
  and a `StartupTask`-based autostart branch in `autostart.rs`), the **Start menu AUMID shortcut property** (NSIS cannot set it;
  the app registers its AUMID under `HKCU\Software\Classes\AppUserModelId` at startup), and the updater.
