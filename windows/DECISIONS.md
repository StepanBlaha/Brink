# Brink for Windows: decisions

Source: `docs/WINDOWS-PORT.md` section 2.1. Dated entries below the table record deviations.

| # | Decision | Why |
|---|---|---|
| D1 | Tauri 2 (Rust core) + React 19 + TypeScript strict + Vite + CSS Modules + Motion (`motion/react`) | Fixed by the owner. Small binary, WebView2 preinstalled on Windows 11, owner is a React/TS developer. |
| D2 | Editor: TipTap 2 (headless, on ProseMirror) with a custom flat schema, not BlockNote | Brink's model is a flat list of paragraphs with `kind` and `depth`; the planner diffs that list against the server tree. TipTap gives full control of identity rules, node views and input rules. |
| D3 | Rust owns: Notion HTTP + rate limiter + retries, token (Credential Manager), file storage (atomic JSON), the write queue and executor, uploads, image cache, window management, click-through, hotkeys, tray, notifications, autostart, deep links, single instance, demo fake server | One rate limiter and one queue for every window; the token never enters a WebView. |
| D4 | TypeScript owns: I/O-free domain logic ported from NotionKit (editor model, sync planner, markdown, natural dates, snooze, filters, summaries, Today, reminders, mini-list) and all UI | Pure logic, testable with Vitest, ported 1:1 from the Swift tests. |
| D5 | Shared JSON shapes: Rust stores and executes queue ops in the NotionKit JSON shapes; Rust ports the request encoders, TS ports the decoders; both tested against `windows/fixtures/` | The queue must run writes from any window even when the notch window is busy. |
| D6 | One hub window: the notch window's JS runtime runs summaries, Today, reminder planning and polling; other windows read state via Rust commands and events | One owner avoids duplicate polling and rate-limit waste. |
| D7 | State: Zustand per window, hydrated from Rust (`*_get`) and kept fresh by Rust events; Rust is the single writer of persisted state | Simple, no cross-window store library. |
| D8 | Storage root `%APPDATA%\Brink\` for small state, `%LOCALAPPDATA%\Brink\` for cache and logs; same file names as the Mac; UserDefaults keys move into `settings.json` | Mirrors the Mac layout; caches must not roam. |
| D9 | Identifier `cz.stepanblaha.brink`, credential service `cz.stepanblaha.brink` | Windows has no legacy installs. |
| D10 | Icons: Lucide (ISC); SF Symbol names in shared JSON are mapped to Lucide | SF Symbols are licensed for Apple platforms only. |
| D11 | Hotkeys: same defaults with Alt for Option and Ctrl for Command | No Option/Command keys on Windows. |
| D12 | Package manager npm, Node 22, Rust stable (MSRV pinned in `rust-toolchain.toml`) | Matches `website/` and CI. |

## 2026-10-05 M0 deviations

- **Workflow file name.** Owner asked for `.github/workflows/windows.yml`; the plan says `windows-ci.yml`. Used `windows.yml`.
- **Commit on `main`.** Plan 5.4 says branch only; owner explicitly asked for a commit and push to `main` so CI runs for M0.
- **Playwright and WebdriverIO deferred.** `playwright.config.ts` and `wdio.conf.ts` are not created in M0; they arrive with the first UI milestone that needs them (M2/M3). Vitest, ESLint, clippy and cargo test are in place.
- **Settings window visible at startup.** Plan says settings is created on demand. In M0 it is declared in `tauri.conf.json` with `visible: true` so `tauri dev` shows a placeholder window (the notch is hidden by design). Moves to on-demand creation in M8. `capture` and `notch` are hidden. Tray is added in M7.
- **`macOSPrivateApi` enabled** (Cargo feature `macos-private-api`) so the transparent notch window works on macOS dev machines. No effect on Windows.
- **Windows `windows` crate** is declared as a Windows-only dependency, unused until M2; Win32 code stays behind `#[cfg(target_os = "windows")]` with a no-op fallback elsewhere.
- **Versions.** Package versions are whatever `npm` resolved on 2026-10-05 (React 19, Vite 8, Vitest 5, TS 6, ESLint 10, Tauri 2). `package-lock.json` and `Cargo.lock` are committed.
- **Icons.** Generated with `npx tauri icon ../branding/icon-1024.png`; android/ios outputs removed.

## 2026-10-05 M1 decisions

- **Hotkey defaults in settings.** `hotkeys` defaults to `{toggleLastPin: "Alt+Space", openPinN: "Alt", quickCapture: "Alt+Shift+Space", clipboardAppend: "Ctrl+Alt+V"}`; `openPinN` stores only the modifier prefix like the Mac. Stored values merge over defaults on read.
- **Settings validation.** `settings_set` is all-or-nothing and rejects unknown keys and invalid values; invalid stored values fall back per key. Empty or null optional strings (`activeGroupID`, `lastOpenedPinID`, `quickCaptureLastPinID`) read as absent.
- **Queue timer.** Like the plan, `WriteQueue` has no timer; the hub calls `queue_process` on `online` and every 60 s while pending > 0 (UI milestone).
- **Restart test.** "Kill the process mid-drain" is simulated by aborting the submit task while the server stalls, then reopening `pending.json` and replaying (no subprocess kill).
- **Cache blocks.** `cache_save` takes raw API block JSON (plan 9 item 1); Rust validates JSON and restricts pinId/kind to `[A-Za-z0-9_-]` against path traversal.
- **Credentials backend.** `keyring` v3: `windows-native` on Windows, `apple-native` on macOS dev machines, in-memory elsewhere. Credentials of 2048 bytes or more are refused.
- **create_row command** returns `[page]` (array) so the TS row decoder is uniform. `notion_append_blocks` takes queue-shaped `position` and converts to the API `position` param in Rust. RichText chunks by grapheme cluster (Swift `Character`).
- **Content-Type.** Exactly one header per request (JSON, or the multipart type for uploads).
- **Logging.** `logging.rs` is a small own rolling file logger (1 MB x 3) that redacts `secret_`/`ntn_` tokens and `Bearer` values before writing.
- **Debug page** (search results from real token or fake server) deferred; no UI lands in M1.
- **Shared commit.** The M1 commit also contains the concurrent M2 work-in-progress that was already in the tree and green.

## 2026-10-05 M2 notch window

- **File locations.** `notchGeometry.ts` lives in `src/features/notch/` (not `src/domain/store/`, which M1 owns); strip, panel and peek are in `src/features/notch/` too for M2. They move in M3.
- **Placement uses Tauri monitor APIs** (`Monitor::work_area`, `cursor_position`) rather than `EnumDisplayMonitors`; same data on Windows and macOS, so placement and click-through run on a Mac. `placement.rs` is pure and unit-tested with synthetic rects.
- **Display changes by polling.** A 100 ms signature poll of monitors, work areas and scale re-places the window instead of `WM_DISPLAYCHANGE`/`WM_DPICHANGED` hooks (no subclassing, within the 250 ms target). Taskbar auto-hide overlap and D3D full screen are polled in `win32.rs` (250 ms / 2 s).
- **Window size = viewport.** The frontend reads `innerWidth/innerHeight`; Rust only sets the HWND once per placement. Anchor is the window midpoint (top edge is monitor-centered).
- **Outside click.** Windows `GetAsyncKeyState`, macOS `CGEventSourceButtonState` (dev), polled with the cursor.
- **Focus.** Taken on `focusin` of a text input (`notch_request_focus`), released when the panel leaves expanded.
- **Full screen** hides only for `QUNS_RUNNING_D3D_FULL_SCREEN` (adapted, plan 3.a.3). Secondary-monitor taskbars are not checked for auto-hide overlap yet.
- **Not in M2:** resize grips, virtual-desktop pinning, SystemAccent. Icons are inline SVG until M8; fake pins use emoji.
- **Debug:** `window.__notch("strip" | "expanded:tasks" | "peek:tasks" | "edge=left" ...)` in dev builds and `?edge=&size=&pill=&outline=1&phase=&backdrop=1` query params.
- **Verification on Mac** used the Vite page in the browser pane (the real Tauri window was run and showed no errors, but its screenshots would capture the owner's desktop and are not stored).

## 2026-10-05 M4 database task view

- **NaturalDate not ported yet.** Quick add creates plain titles (no "tomorrow" parsing); natural dates arrive with M7. `domain/capture/snooze.ts` holds only the pieces snooze needs (`isoString`, `nextOccurrence`, `snoozeTarget`).
- **Setup flow deferred.** `DatabaseSetup`, `ViewBuilder`, `FilterRow`, `SortRow` (pinning) are not in M4: saved filters, sorts, view name and show-completed are fully applied from `pin.config`, but the editor for them lands with the pinning UI (M3/M8). The title rule `"<base> · <viewName>"` is applied there.
- **Not wired into the panel.** `DatabaseHost` (pin -> task view) and `EmbeddedDatabase` (child_database id -> compact view) are ready; the notch `Panel` host belongs to M3 and swaps its placeholder rows for `DatabaseHost`. Embedded view is used by the editor in M5.
- **Dev page.** `#/dbdemo` (add `?compact=1`) renders the Sprint database on in-memory ports (`fakePorts.ts`), no Tauri needed.
- **Status pill is read-only** like the Mac; `setStatus` exists in the model (tested) for later UI.
- **Title edit** commits on Enter or blur (Mac: Enter only); Escape reverts.
- **Row-out** uses the `list` spring plus the 0.8 s model delay; Reduce Motion uses the instant transition.
- **Sound tick** on completion is M6.
