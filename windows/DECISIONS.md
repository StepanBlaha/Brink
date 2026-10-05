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

## 2026-10-05 M3 pins and add flow

- **Strip moved** to `src/features/strip/`; `Strip` takes `PinItem`s. Panel/Peek still get the M2 `FakePin` shape through `notch/pinAdapter.ts` until M6 summaries.
- **Today pin hidden in M3** (`stripItems(..., showToday=false)`); the reorder index shift and drop rejection are implemented and tested for M6.
- **Submenu is inline** (accordion) in `common/Menu`, so every menu area stays inside one hit rect (the window is click-through outside reported rects).
- **Overlays block folding**: a menu or popover sets `isBlocked`; outside click or Esc dismisses it before collapsing the panel.
- **No Playwright yet**: keyboard-navigation tests use Testing Library (`@testing-library/react`, new dev dependency). Playwright and Windows screenshots wait for a Windows run.
- **Icons**: three inline Lucide paths in `common/icons.tsx`; custom lucide/SF symbol pin icons render as a colored placeholder until the M8 picker.
- **Panel size** writes `settings.panelSizes` through `settings_set` (clamped on read) rather than `panel_size_set`.
- **Mock IPC** (`?pins=0` for an empty workspace) now has an in-memory workspace for pins, groups, auth and search.

## 2026-10-05 M7 capture, dates, hotkeys, tray (TypeScript side)

- **Markdown seam.** `domain/capture/captureMarkdown.ts` is a faithful port of Swift `MarkdownParser` behind a `MarkdownPort`, because M5a's `domain/markdown` was not available. Capture and clipboard tests compare against the port, so swapping the default to the M5a parser needs no test change.
- **NaturalDate** uses the local zone (Vitest pins `TZ=Europe/Prague` in `vitest.config.ts`). The NSDataDetector fallback is dropped (plan 9 item 21). ISO month 13 is rejected instead of rolling over.
- **Database quick add** (M4 deferral) now parses natural dates into the pin's date property, else the schema's first date property; no date property keeps the phrase in the title.
- **Clipboard append** reads `settings.lastOpenedPinID`, the key the hub writes when a pin is expanded (plan 9 item 2 not copied). Covered by `clipboardAppend.test.ts`.
- **Hub** (`features/hub/useHubHandlers.ts`, mounted in `NotchRoot`) handles `hotkey://fired`, `hotkey://failed` (toast), `deeplink://open`, `notch://open-pin`, tray count. "Open in notch" in the flyout emits `notch://open-pin` from JS.
- **Tray counts.** Summaries are M6, so the tray tooltip count and section counts use loaded items until then.
- **Capture destination** is a native `<select>` styled as a chip (the window is only 150 px tall, a popup menu would be clipped).
- **CaptureTests "wire"** (request body on the wire) is covered by the existing Rust `create_row` endpoint tests plus `planCapture` tests.

## 2026-10-05 M7 Rust

- **Hotkey errors** are codes: `inUse`, `invalid`, `winKey`, `noModifier`, `reserved`, `unknown`. Accelerators are stored canonically (Ctrl, Alt, Shift, key); `hotkey://failed` for `openPinN` carries the first failing concrete combo (e.g. `Alt+3`). Failures at startup are emitted before the UI may listen, so the UI should also read `hotkeys_status`.
- **Resting pill item** toggles `pillStyle` between `hidden` and `line` (Mac behaviour: show restores `line`, not the previous dot/percent). Label flips "Resting pill: Show/Hide".
- **About, Privacy, Terms** from the tray menu emit `window://open {name}` (`about`, `legal:privacy`, `legal:terms`) for the M8 `window_open` path; Help and Feedback use `open_url` targets from Links.swift.
- **Tray click right after a blur-hide** (under 250 ms) only closes the flyout. With `menuBarListEnabled` off, left click pops the native menu. Tray icon is the app icon until the white/dark glyph ships (M8/M10). Extra event `tray://shown` lets the flyout replay its scale-in.
- **Deep links**: the argv of the first launch is processed 0.9 s after setup (so the capture webview can receive `capture://prefill`); single-instance forwards later launches. No `deep-link` feature on single-instance; argv is parsed by `deeplink/args.rs`.
- **NSIS hooks** write HKCU keys for `.txt/.md/.url` ("Send to Brink") and `brink`; the bundler also registers the scheme from `plugins.deep-link`, the values are identical.
- Full-crate msvc check is not possible on the Mac (ring needs MSVC headers); the new Windows-only lines reuse existing `win32.rs` calls.

## 2026-10-05 M5a editor model, planner, engine

- **Scope split.** `ParagraphSyntax`, `MarkdownParser`, `MarkdownSerializer`, planner, engine (+images) and the pure parts of `WYSIWYGTests`, `MoveBlockTests` and `EditorFeatureTests` are ported with their cases. The text-level cases of `EditorDocumentTests` and `WYSIWYGTests` (typing, Enter, Backspace, undo of a shortcut, paste/copy in a text view) need the real ProseMirror state and move to M5b, as the plan says.
- **Ports.** The engine takes `EngineApi` (block children, page, append, queue submit, upload) and `EditorDocPort`, never `invoke` directly; the app wires them to `ipc/commands.ts` in M5b/PageView. `src/test/fakeNotion.ts` is the `FakeNotionServer` route table behind an `EngineApi`, `src/test/editorHost.ts` the array-model host.
- **Underline and color kept (PORT 9.12).** `RichTextSpan` got optional `underline` and `color` (TS and Rust, omitted from JSON when default so queue fixtures are unchanged). `SpanRuns.key` appends `\0u|color` per run only when a run has either, so changing only those is an update. Markdown copy still ignores them.
- **Mass-delete guard counts blocks (PORT 9.3).** `deletes` = top-most delete ops plus their nested descendants in `previous`; thresholds unchanged (>= 3 and more than half of the non-token blocks).
- **Cache.** `editor-doc` cache stores `SyncedParagraph[]` as JSON with plain span text (PORT 9.1); kinds are `{t: ...}` objects, not the Swift `Codable` shape.
- **Strings.** Status "Offline, will retry" (plan), hint text from the Swift source ("Delete it in Notion."), no em dash anywhere. "Gone" = the Rust notFound message or "archived" (PORT 9.15).
- **Insert and image uploads** go through `EngineApi.appendBlocks` / `uploadFile` (Tauri `notion_append_blocks` / `upload_image` in the app); update and delete use `queue_submit(retainOnTransientFailure: false)`.
- **Moves.** `blockMoves.ts` holds the index math of `moveBlock`, `maxDepth`, up/down targets; editors apply the plan. A trailing empty text paragraph is not movable (Mac: no characters).
- **Covers.** The cover cache key test stays in Rust (`store/covers.rs`, M1).

## 2026-10-05 M5b editor UI

- **D2 deviation: raw ProseMirror, no TipTap.** The editor uses `prosemirror-{model,state,view,transform,history,keymap,commands,inputrules}` directly (the foundation TipTap wraps). Same schema, plugins and input rules as the plan; one less abstraction layer for custom identity, keymap and decorations.
- **Identity rules** are realized by the commands (Enter keeps the top half, merge keeps the first block) plus an `appendTransaction` plugin that only repairs duplicates, kinds and code marks, instead of the mapping-inversion algorithm. A stamp map (`localId -> blockId`) restores an engine-confirmed id when undo/redo brings a block back with `blockId: null`.
- **Schema.** Token and image are inline atoms (`chip`, `image`) inside their block. `underline` and `color` marks exist because M5a keeps them through edits (PORT 9.12).
- **Paste** with text ending in a newline at a line start inserts the whole lines above and the line keeps its identity (Mac `paste` test). Copy numbers numbered items within the copied slice.
- **Playwright deferred again.** The demo-script check ("[] Ship the beta", "## Next", bold, "/to" + Enter) ran through headless Chrome over CDP against the Vite page `#/editordemo`; screenshots in `docs/screens/m5b/`. Text-level tests run on a real `EditorView` in jsdom (`src/test/pmHost.ts`).
- **Esc in the slash menu** stops propagation so the panel does not fold. Link popover (Ctrl+K), find, images, drag handle and footer are M5c/M5d.

## 2026-10-05 M6 peek, badges, Today, reminders, sounds

- **Toast delivery.** `windows` crate `ScheduledToastNotification` (no tauri-plugin-notification). Rust keeps a registry (`%LOCALAPPDATA%\Brink\notify.json`) of scheduled requests; TS plans and reconciles through `notify_pending` / `notify_apply` / `notify_status`. Non-Windows uses a logging no-op. Windows code type-checked for msvc in a scratch crate.
- **Ids.** `ScheduledToastNotification.Id` is limited to 16 characters, so Id = FNV-1a hex of the identifier; Tag = identifier (hashed `h.<hex>` above 64); Group = pinId. Removal matches on Tag.
- **Actions.** All three toast actions use `activationType="protocol"` with `brink://notify?action=done|snooze|open&pinId=&itemId=` (plan 3.f adapted); the hub handles them through the deep-link path. Snooze content is rebuilt from the loaded summary (title, "<pin> · Due ..."), fallback "Reminder".
- **AUMID.** Registered under `HKCU\Software\Classes\AppUserModelId\cz.stepanblaha.brink` at startup (dev and installed); the installer shortcut is M10.
- **Autoplay.** `additionalBrowserArgs` on the notch window sets `--autoplay-policy=no-user-gesture-required`.
- **Pill measures the strip items including Today** (Mac parity: Today summary has total = open, done = 0).
- **Debug.** `localStorage brink.debug.snoozeSeconds` shortens the 1 h snooze in dev; `?summaries=demo` seeds fake summaries in the browser mock and keeps network services off.
- **Not wired.** Tray window still has stub `summaries`/`tick`; hub listens for `sound://tick` and `pin://content-changed` events for other windows. Real-Windows toast checks are manual.

## 2026-10-05 M5c+M5d drag, guard, find, cover, images, links

- **Rich text on load is fine.** The `**beta**` in the M5b screenshot was a literal in the demo fixture (the fake server stores `text` as plain). Pipeline decode -> spans -> marks is covered by `richTextLoad.test.ts`.
- **Engine `dispose()` keeps listeners.** Subscribers unsubscribe themselves; clearing them broke the footer and cover under React StrictMode (effects re-run on the same engine).
- **Drag handle** lives inside the editor host (pointer events on `window` while dragging). Hidden (collapsed) blocks are skipped as drop targets; a drop into the block's own subtree is a no-op.
- **Move keeps node identity**: the moved nodes keep their attrs, so ids survive and the planner recreates the moved block (no duplicate).
- **Dropped files** arrive as Tauri paths (`dragDropEnabled`), read by Rust `read_image_file` (image extensions only, error kind `tooLarge` with the byte count above 20 MB). DOM paste and drop use `File` directly.
- **Link popover** needs a selection (Mac beeps without). Ctrl+click opens a link through the allow-listed `open_url`.
- **Embedded database** renders under its chip inside the node view with a React root; the chip title still opens Notion.
- **Find bar** is sticky inside the scroller. Keys: Ctrl+F, F3 / Ctrl+G (Shift = previous).


## 2026-10-05 M10 packaging and release

- **Version.** Windows uses the repo `VERSION` marketing token (0.10.0, same as the Mac). `npm run sync-version` writes it into `package.json` and `tauri.conf.json`; the release workflow runs it and fails if the tag is not `win-v<VERSION>`.
- **Tags.** `win-v*` (owner request) instead of the plan's `v*`, so Windows never collides with the Mac `v*` release. Draft releases are created with `latest=false` so `releases/latest` stays the Mac release. The release job creates its own draft (not an upload to the Mac release).
- **Targets.** NSIS x64 and arm64 (arm64 cross-compiled on windows-latest). MSI and MSIX documented in `RELEASING.md`, not built.
- **Signing.** Azure Trusted Signing through Tauri `signCommand` (`trusted-signing-cli`), else a base64 pfx thumbprint, else unsigned; chosen at build time from secrets.
- **Uninstall data.** Hook deletes `%APPDATA%\Brink` and `%LOCALAPPDATA%\Brink` when the stock "delete the application data" box is ticked.
- **Website.** `site.windowsAvailable` (false) gates the Windows download; JSON-LD adds Windows only when true.

## 2026-10-05 M8 settings, appearance, groups, icons, onboarding, About, autostart

- **On-demand windows.** `settings`, `onboarding`, `about`, `legal-privacy`, `legal-terms`, `legal-notice` are declared in `tauri.conf.json` with `create: false` and built by `window_open` (`commands/windows.rs`) from their config entry; closing destroys them. Settings moved out of startup (M0 note). Rust itself listens for `window://open {name}` (tray About, Privacy, Terms), so no webview has to be alive for it; `show_settings` and `--settings` go through the same function. `window_open("settings", section)` builds with `#/settings/<section>` or emits `settings://section` to an open window ("Manage..." opens Groups).
- **Autostart is the Run key, not `tauri-plugin-autostart`.** `HKCU\...\Run\Brink = "<exe>" --autostart` is two registry calls through the `windows` crate that was already a dependency, so no extra plugin or capability. The StartupApproved key (Task Manager toggle) is read, so the row can say "Turned off in Windows Settings, Apps, Startup." with an "Open Startup settings" button (`ms-settings:startupapps`). MSIX StartupTask stays with M10. `launched_at_login` lets the hub skip onboarding on an autostart. Verified on Windows only by signing out and in (listed in PROGRESS).
- **System accent** reads `HKCU\Software\Microsoft\Windows\DWM\ColorizationColor` (ARGB, alpha dropped) through `system_accent`, polled every 5 s while the "System accent" preset is chosen. Unknown falls back to blue. `--accent` and `--on-accent` (black on light accents such as yellow and off-white) are set per window by `startAppearance()` inside `initState`.
- **Settings drive the notch** through `useSettingsSync` in the notch route: edge, size, pill style and outline copy into the notch store (the M2 stand-ins); debug query params still win, so the screenshots keep working. Display: "Main display" is the primary monitor, "Display with mouse" and a named display resolve to an index into `available_monitors` (existing `resolveDisplay`), re-read every 1.5 s while not "main". A gone display falls back to index 0.
- **Group rows commit on blur or Enter**, not per keystroke as on the Mac (every rename is a file write plus a refetch here). Move up/down use the same offsets as the Mac (`index - 1`, `index + 2`).
- **Icon picker is hosted in the expanded notch**, like the add flow (it reuses `openAddFlow` plus an `iconPinId`), not as its own window; it stays open after a pick, "Reset to Notion icon" clears the override. Symbols are Lucide (`lucide-react`, ISC; named imports so only about 80 icons ship). New custom icon kind `lucide`; Mac `sfSymbol` names are mapped (`SF_TO_LUCIDE`); an unknown name draws the title's first letter in the chosen color. Emoji catalog is the 178 entries of `EmojiCatalog.swift` ("about 200" in the plan). "Open emoji panel" focuses a hidden input and sends Win+. (`emoji_panel_open`, `SendInput`); what the panel types is taken from that input.
- **Legal windows** import `../../legal/*.md?raw` at build time (`server.fs.allow: [".."]` in Vite and Vitest). The inline parser is the Mac's (headings, bullets, tables, bold, italic, code, links); table cells join with " · " instead of an em dash. The text still carries the Mac wording until M10 updates `legal/`.
- **About version.** `build.rs` reads the `(N)` of the repo `VERSION` into `BRINK_BUILD`, so About shows "Version 0.10.0 (2)" (it showed build 0 before).
- **Connection.** Settings says "N items", onboarding "N pages" (plan 9 item 18). The Notion sign-in block shows only when `oauth_available` is true. Disconnect calls `auth_disconnect` (Rust removes all three credentials).
- **Tray flyout wiring.** The hub broadcasts open counts as `summaries://changed` (debounced 200 ms, and when asked via `summaries://request`); the tray keeps them in a module value and only redraws if they arrive within 1.5 s of opening (a remount would drop typed text). The tray's tick is `sound://tick`, content changes are `pin://content-changed`; Settings "Test" is `sound://test` (plays even with sounds off).
- **Onboarding "Add a page"** emits `notch://open-add`; the hub opens the add flow. The welcome opens once per launch when `shouldShowOnboarding`, never from an autostart.
- **SlashMenu em dash** was already gone; nothing to change.
- **Not done here:** Playwright/WebdriverIO, Windows screenshots at 100/150/200 %, MSIX StartupTask.
