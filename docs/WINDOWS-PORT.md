# Brink for Windows: porting and implementation plan

_Status: plan, not started. Written 2026-10-05 against Brink 0.10.0 (repo `VERSION` = `0.10.0 (2)`)._

This document is the single source of truth for building **Brink for Windows** in `windows/` of this repository. It is written for an AI coding agent (or a human) with no other context. Work through it milestone by milestone (section 4), follow the working rules (section 5), and treat the Mac app as the reference implementation.

**How to read the citations.** `Sources/...` paths point at the Swift reference. Short forms used in tables: `NK/` = `Sources/NotionKit/`, `ND/` = `Sources/NotionDock/`, `F/` = `Sources/NotionDock/Features/`. "Lnn" is a line number at the time of writing; if lines drift, search for the named symbol. **Every number in this plan comes from the cited Swift file. If you find a mismatch, the Swift source wins**: fix this document and note it in `windows/DECISIONS.md`.

**Product facts.** Website https://brinknotch.site · Repo https://github.com/StepanBlaha/Brink · License MIT (name and icon reserved, `TRADEMARKS.md`) · Mac install also via the Homebrew tap `StepanBlaha/homebrew-tap` (`brew install --cask stepanblaha/tap/brink`) · Contact stepa15.b@gmail.com · Non-affiliation line (must appear wherever Notion is named in About, legal and marketing): "Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc."

## Contents
1. Goals, non-goals and the parity matrix
2. Architecture
3. The hard parts (a: notch window on Win32 · b: morphing shape and phases · c: editor sync · d: Notion client · e: credentials · f: notifications · g: hotkeys · h: tray flyout · i: autostart · j: sounds · k: parity test catalog · l: share target and `brink://` · m: widget)
4. Milestones M0 to M10
5. Agent working rules
6. Testing and verification on Windows
7. Packaging and distribution
8. Risks, open questions, effort estimate
9. Appendix: inconsistencies found in the Mac code

---

## 1. Goals, non-goals and the parity matrix

### 1.1 Goals
- A Windows 10 (22H2) / Windows 11 app that feels like the Mac Brink: a pure black notch on a screen edge that morphs resting pill → hover strip → expanded panel as **one** shape, with the same pins, groups, saved database views, Notion-style editor (one line = one Notion block), write queue, summaries and badges, Today view, reminders, quick capture with English and Czech natural dates, hotkeys and settings.
- The same data model and semantics as NotionKit, ported to TypeScript (domain logic) and Rust (I/O, OS integration), with the Swift test suite ported as the parity spec.
- Same brand and voice (branding/BRAND.md).
- Ships as a signed (if possible) per-user installer from GitHub Releases next to the Mac zip, plus winget; Microsoft Store as a stretch goal.

### 1.2 Non-goals (v1 Windows)
- Changing the Mac app, NotionKit, or the Mac storage format. Nothing outside `windows/` is modified except as listed in section 5.1.
- Sharing one codebase with the Mac app. The Mac app stays native Swift.
- Syncing pins/settings between a Mac and a Windows PC.
- OAuth "Connect to Notion" as the default. It stays dormant exactly as on the Mac (`ND/App/OAuthConfig.swift` placeholders); token paste is the default path.
- A Windows 11 Widgets Board widget in v1 (deferred, see 3.m).
- The scripted demo director (cursor animation, recorded videos). Demo mode itself is in scope.
- Multiple workspaces, mentions, colors and underline in rich text (the Mac app does not support them either, see section 9).

### 1.3 Parity matrix
Legend: **parity** = same behavior and constants; **adapted** = same intent, Windows-specific mechanism or a deliberate difference (record it in DECISIONS.md); **deferred** = not in v1 Windows.

#### Notch and window
| Feature | Mac implementation | Windows approach | MS | Status |
|---|---|---|---|---|
| Single morphing notch window, fixed frame, only shape and hit region change | `ND/Windows/NotchPanel.swift`, `ND/Windows/DockController.swift` | One transparent, topmost, tool-style Tauri window per placement; React draws the SVG shape (3.a, 3.b) | M2 | parity |
| Non-activating, takes focus only to type | NSPanel `.nonactivatingPanel`, `activateForEditing()` DockController L941-974 | `WS_EX_NOACTIVATE` toggled, `SetForegroundWindow` on expand, restore previous foreground on collapse (3.a.5) | M2 | adapted |
| Click-through outside the shape | `ignoresMouseEvents` toggled on every mouse move vs `hotRect(phase)` (shape bounds + 30 pt) DockController L886-896 | Rust cursor poll at 60 Hz + `set_ignore_cursor_events` (3.a.4) | M2 | adapted |
| Phases resting / strip / expanded | `F/Notch/NotchPhase.swift`, DockController `setPhase` L703-726 | Zustand `notchStore.phase` + same transitions (3.b.4) | M2 | parity |
| Hover-in immediate, hover-out 0.35 s | `Theme.Notch.hoverOutDelay` ND/Theme/Theme.swift L135, DockController L909-937 | same timer in `useNotchHover` | M2 | parity |
| Concave flares, mirror-image open/close springs | `F/Notch/EdgeNotchShape.swift`, `Theme.Motion.unfold` (0.62, 0.72) | SVG path generator + Motion spring (3.b) | M2 | parity |
| Reduce Motion | `NSWorkspace.accessibilityDisplayShouldReduceMotion` Theme L46-48 | `SPI_GETCLIENTAREAANIMATION` (Rust) and `prefers-reduced-motion` | M2 | parity |
| Edges left / right / top | `DockEdge` in `ND/App/Settings.swift`, `NotchGeometry.windowFrame` | same three edges; top is centered (no hardware notch) | M2 | adapted |
| Merge with hardware notch | DockController L345-377, `mergeWithHardwareNotch` | not applicable; option hidden | — | deferred (n/a) |
| Display choice main / with mouse / named | `NK/Store/DisplayPreference.swift` | same three options over `EnumDisplayMonitors`; name = monitor friendly name + device name | M2 | parity |
| Size presets Small/Medium/Large | `DockSize` metricsScale 0.85/1/1.2, fontScale 0.93/1/1.1 (Settings.swift L45-60) | same, multiplied by the monitor DPI scale | M2 | parity |
| Pill styles Hidden / Dot / Line / Percent | `NK/Store/PillStyle.swift`, `Theme.Notch.restingMetrics` | same metrics (3.b.2) | M6 | parity |
| Live pill progress (Off / Active group / Last pin) | NotchRootView L106-151, `pillProgressMode` | same | M6 | parity |
| Badges Off / Open / Due today, "99+" | StripView `PinBadge` L263-291, `badgeMode` | same | M6 | parity |
| Notch outline (white 0.22 resting / 0.14 open) | NotchRootView, `notchOutline` default true | same | M2 | parity |
| Peek card: 0.5 s dwell, 0.3 s dismiss, card hover keeps it open, click opens, tick in place | StripView L235-247, `NotchState.schedulePeekDismiss` L25-31, `PeekTooltip.swift` | same (3.b.5) | M6 | parity |
| Reminder peek: strip opens with peek for 3 s | DockController L1090-1103 | same | M6 | parity |
| Resize per pin (edge grip 6, corner 18, double-click resets) | `F/Notch/ResizeGrips.swift`, DockController L439-490, `PanelSizeStore` | same math in `useResize`; stored in settings (2.6) | M3 | parity |
| Full-screen apps | `.fullScreenAuxiliary` only (stays visible) | detect full screen; hide for exclusive D3D full screen (3.a.3) | M2 | adapted |
| Menus and popovers keep notch open | DockController L1038-1058 | in-window popovers (Radix-free custom) keep `menuOpen` flag | M3 | parity |
| Outside click / Esc collapses; keep-open pin ignores outside clicks | DockController L731-736, L988-1030 | Rust outside-click detection + Esc in WebView (3.a.4) | M2 | parity |

#### Pins, strip and panel
| Feature | Mac implementation | Windows approach | MS | Status |
|---|---|---|---|---|
| Strip of pins + group switcher + "+" | `F/Strip/StripView.swift`, `Theme.Notch.stripMetrics` | `Strip.tsx` with the same metrics | M3 | parity |
| Pin search and add flow (300 ms debounce, ↑↓ Enter) | `F/Pinning/PinSearchView.swift`, `AddFlowHeader.swift` | `AddFlow/PinSearch.tsx` | M3 | parity |
| Database setup (done property, status value, date, view options) | `F/Pinning/DatabaseSetupView.swift` | `AddFlow/DatabaseSetup.tsx` | M4 | parity |
| Saved views: filters (AND), sorts, show completed, view name | `F/Pinning/ViewBuilderView.swift`, `NK/Notion/ViewFilter.swift` | `ViewBuilder/*.tsx` + `domain/viewFilter.ts` | M4 | parity |
| Reorder pins by drag (stride = iconSize + iconSpacing) | StripView L123-209, `PinStore.move(pinID:toIndex:withinGroup:)` | pointer-events drag in `Strip.tsx`, same index math | M3 | parity |
| Context menu: Keep open, Change Icon…, Edit View…, Move to group, Open in Notion, Unpin | StripView L76-113 | in-window context menu component | M3 | parity |
| Groups (switcher popover, All pins, New group…, Manage…) | StripView L326-426, `PinStore` groups | same; "New group" uses an inline input instead of NSAlert | M8 | adapted |
| Custom icons: emoji / SF Symbol / letter, "Also set as page icon in Notion" | `F/IconPicker/*`, `CustomIcon` in `NK/Store/PinStore.swift` | emoji + **Lucide icon** (SF Symbols are Apple-only, legal/NOTICE.md) + letter; new JSON kind `lucide` (2.6) | M8 | adapted |
| Panel header: icon, title, Open in Notion, Keep open, Close | `F/Panel/PanelView.swift` | `PanelHeader.tsx` | M3 | parity |
| Open in Notion (`notion://` if handler exists, else https) | DockController L832-843 | Rust: check `HKCR\notion` exists, else https via `tauri-plugin-opener` | M3 | parity |
| Expanded panel follows clicked icon on side edges | `clampedExpandedCenter` DockController L691-697 | same | M3 | parity |

#### Database task view
| Feature | Mac implementation | Windows approach | MS | Status |
|---|---|---|---|---|
| Rows, checkbox/status done toggle, row fade-out 0.8 s | `F/DatabaseView/DatabaseTaskView.swift`, `DatabaseViewModel.swift` L209-236, L334-343 | `DatabaseView/*.tsx`, `useDatabaseModel` | M4 | parity |
| Quick add (temp row at top), rename, date chip + picker, status pill | DatabaseViewModel L238-307 | same | M4 | parity |
| Snooze menu: Later today (+3h), Tomorrow, Next week (Monday), Pick date… | DatabaseTaskView L220-231, `NK/Capture/SnoozeCalculator.swift` | same | M4 | parity |
| Polling 45 s while open, cache first | DatabaseViewModel L165, L106-127 | same | M4 | parity |
| Embedded (compact) database inside a page, 8 rows, no polling | `EmbeddedDatabaseView.swift`, DatabaseTaskView L14 | same | M5d | parity |

#### Page editor
| Feature | Mac implementation | Windows approach | MS | Status |
|---|---|---|---|---|
| One paragraph = one Notion block, exact identity sync | `NK/Markdown/EditorDocument.swift`, `EditorSyncPlanner.swift`, `PageEditorEngine.swift` | TipTap/ProseMirror with block attrs + ported planner/engine (3.c) | M5a-c | parity |
| Block kinds: paragraph, H1-3, bulleted, numbered, to-do, quote, code, divider, toggle, callout, image, token chips | `NK/Markdown/ParagraphSyntax.swift` `ParagraphKind` | one PM node type `block` with `kind` attr (3.c.2) | M5a | parity |
| Markdown block shortcuts + inline formatting, ⌘Z restores literal text | `EditorInput.swift`, `EditorCommands.swift` L93-149 | ProseMirror input rules with "undo input rule" (3.c.7) | M5b | parity |
| Slash menu (12 commands, scoring) | `SlashCommand.swift`, `F/PageView/SlashMenu.swift` | `SlashMenu.tsx` + plugin | M5b | parity |
| Toggles (local collapse) and callouts | EditorDocument L365-406, ETV+Gutter | node views + decorations | M5b | parity |
| Find bar (Ctrl+F, Ctrl+G, Shift+Ctrl+G) | `F/PageView/FindBar.swift` | decorations-based find plugin | M5d | adapted (keys) |
| Cover strip 56 pt | `F/PageView/CoverStrip.swift`, `NK/Notion/CoverCache.swift` | `CoverStrip.tsx` + Rust cover cache | M5d | parity |
| Images via file upload (paste, drop, 20 MB) | `PageEditorEngine+Images.swift`, `NK/Notion/FileUpload.swift` | same flow, bytes via Rust command | M5d | parity |
| Drag handle to reorder lines, Alt+Shift+↑/↓ | `ETV+DragHandle.swift`, `ETV+BlockDrag.swift`, `EditorCommands+Blocks.swift` | gutter handle plugin + commands | M5c | parity |
| Mass-delete confirmation | PageEditorEngine L349-359 | same rule and footer button | M5c | parity |
| Undo/redo | NSTextView undo + named steps | ProseMirror history; remote reload clears it (same as Mac) | M5b | parity |
| Save status: Saved / Saving… / offline / error | PageEditorEngine L6-20 | same strings, but "Offline, will retry" (no em dash) | M5c | adapted (copy) |

#### Capture, glance, OS integration
| Feature | Mac implementation | Windows approach | MS | Status |
|---|---|---|---|---|
| Quick capture window 560×150, Enter / Ctrl+Enter / Esc | `F/QuickCapture/*` | second Tauri window `capture` (3.g, M7) | M7 | parity |
| Natural dates EN + CZ | `NK/Capture/NaturalDate*.swift` | `domain/naturalDate/*.ts`; NSDataDetector fallback dropped (see 9) | M7 | adapted |
| Clipboard append (Alt+Cmd+V → Ctrl+Alt+V) | `F/Clipboard/ClipboardAppendController.swift`, `NK/Capture/ClipboardMapper.swift` | Rust clipboard read (`tauri-plugin-clipboard-manager`) + same mapper | M7 | parity (bug fixed, see 9) |
| Capture toast (hold 1.7 s, errors 2.6 s) | `F/QuickCapture/CaptureToast.swift` | click-through `toast` window | M7 | parity |
| Global hotkeys, rebindable, conflict check | `F/Hotkeys/*`, `NK/Store/HotkeyCombo.swift` | `tauri-plugin-global-shortcut` (3.g) | M7 | adapted (Alt) |
| Menu-bar mini-list 320×440 | `F/MenuBar/*`, `NK/Store/MiniList.swift` | tray icon + flyout window (3.h) | M7 | adapted |
| Today view (☀️ virtual pin `brink.today`) | `F/Today/*`, `NK/Store/TodayAggregator.swift` | same | M6 | parity |
| Due reminders + morning summary, actions Mark done / Snooze 1 hour / Open, cap 64 | `ND/Services/ReminderService.swift`, `NK/Store/ReminderPlanner.swift` | Windows toast scheduler (3.f) | M6 | adapted |
| Summaries (300 s refresh, staggered) | `ND/Services/PinSummaryService.swift`, `NK/Store/PinSummary.swift` | `services/pinSummary.ts` | M6 | parity |
| Desktop widget (interactive checkboxes) | `Sources/BrinkWidget/*` | Windows 11 Widgets Board needs a packaged COM provider (3.m) | — | deferred |
| Share extension "Send to Brink" | `Sources/BrinkShare/*`, `NK/Shared/SharedInbox.swift` | `brink://capture?...` protocol + "Send to Brink" Explorer context menu for text/URL files; MSIX share target later (3.l) | M7 | adapted |
| `brink://pin/<id>` deep links | AppDelegate L43-52, `NK/Shared/SharedContainer.swift` | `tauri-plugin-deep-link` + single-instance | M7 | parity |
| Sounds (synthesized tick) | `ND/Services/SoundService.swift` | WebAudio synth with identical parameters (3.j) | M6 | parity |
| Launch at login | `SMAppService` in AppearanceSettingsView L143-201 | `tauri-plugin-autostart` / MSIX StartupTask (3.i) | M8 | adapted |

#### App shell
| Feature | Mac implementation | Windows approach | MS | Status |
|---|---|---|---|---|
| Settings window (Connection, Appearance, General, Groups, Shortcuts) 560×540 | `F/Settings/*` | `settings` window, same sections and copy | M8 | parity |
| Onboarding (3 steps) 460×440 | `F/Onboarding/OnboardingView.swift` | `onboarding` window | M8 | parity |
| About 340×420, legal 480×420 | `F/About/AboutView.swift`, `F/Legal/*` | `about` and `legal` windows rendering bundled `legal/*.md` | M8 | parity |
| No Dock icon, Dock icon while a window is open | `.accessory` policy, AppWindows L72-86 | no taskbar button for the notch; normal taskbar button for Settings/Onboarding/About | M8 | adapted |
| Token paste (default) + Test connection + Disconnect | `F/Settings/ConnectionSettingsView.swift`, `ND/App/AppModel.swift` | same; token stored by Rust (3.e) | M1/M8 | parity |
| OAuth Connect to Notion | `NK/Auth/*`, `ND/App/NotionSignIn.swift`, `broker/` | code ported but hidden until configured | M8 | parity (dormant) |
| Demo mode with fake Notion | `F/Demo/*` (trigger file `demo-mode.json`) | `--demo` flag or `BRINK_DEMO=1` + Rust fake server (6.3) | M9 | adapted |
| Main menu Edit shortcuts | `ND/App/MainMenu.swift` | WebView native editing keys (Ctrl+Z/Y/X/C/V/A) | M5b | parity |
| Offline-safe write queue `pending.json` | `NK/Store/WriteQueue.swift` | `services/writeQueue.ts` + Rust file persistence | M1 | parity |

---

## 2. Architecture

### 2.1 Decisions (copy into `windows/DECISIONS.md` in M0)
| # | Decision | Why |
|---|---|---|
| D1 | **Tauri 2** (Rust core) + **React 19** + **TypeScript strict** + **Vite** + **CSS Modules** + **Motion** (`motion/react`) | Fixed by the owner. Small binary, WebView2 is preinstalled on Windows 11, the owner is a React/TS developer. |
| D2 | **Editor: TipTap 2 (headless, on ProseMirror) with a custom flat schema**, not BlockNote | Brink's model is a *flat list of paragraphs*, each with `kind` and `depth` attributes (`EditorDocument.swift`), and the planner diffs that flat list against the server tree. TipTap lets us define exactly that schema: `doc > block+`, every `block` node carries `localId/blockId/kind/depth/...`. BlockNote imposes its own nested block tree, its own block ids and its own UI and slash menu, so we would fight it on identity (split/merge rules), on Notion-specific kinds (tokens, callout icons) and on styling. TipTap gives full control of input rules, node views, decorations and history, which the identity rules need. |
| D3 | **Rust owns:** Notion HTTP + rate limiter + retries, the token (Credential Manager), file storage (atomic JSON writes), the **write queue** (`pending.json`) and its executor, file uploads, cover/image cache, window management, click-through, hotkeys, tray, notifications, autostart, deep links, single instance, demo fake server. | One rate limiter and one queue shared by every window (notch, capture, tray flyout); the token never enters a WebView; atomic file I/O and OS APIs are native. |
| D4 | **TypeScript owns:** domain logic ported from NotionKit that has no I/O (editor document model, sync planner, page editor engine, Markdown/ParagraphSyntax, natural dates, snooze, view filters JSON, summaries, Today aggregation, reminder planning, mini-list), and all UI. | Pure logic, directly testable with Vitest, ported 1:1 from the Swift tests. |
| D5 | **Shared JSON shapes.** Rust stores and executes queue operations in exactly the NotionKit JSON shapes (2.6). Rust ports the request encoders (`RichText.encode`, `PropertyValue.requestJSON`, `BlockUpdate`, `NewBlock.requestJSON`, `BlockPosition.requestJSON`); TS ports the decoders it needs for display. Both sides are tested against the same JSON fixtures in `windows/fixtures/`. | The queue must execute writes from any window even when the notch window is busy or reloading. |
| D6 | **One "hub" window.** The notch window's JS runtime is the hub: it runs the summary service, Today aggregation, reminder planning and polling. Other windows (capture, tray flyout, settings) read state through Rust commands and react to Rust events. | Windows are separate JS runtimes; one owner avoids duplicate polling and rate-limit waste. |
| D7 | **State:** Zustand per window, hydrated from Rust (`*_get` commands) and kept fresh by Rust events (`pins://changed`, `settings://changed`, `summaries://changed`, `queue://changed`). Rust is the single writer of persisted state. | Simple, no cross-window store library needed. |
| D8 | **Storage root `%APPDATA%\Brink\`** (roaming) for small state; **`%LOCALAPPDATA%\Brink\`** for cache and logs (not roamed). Same file names as the Mac `~/Library/Application Support/NotionDock/` (`NK/Store/AppStorageLocation.swift`). UserDefaults keys move into `settings.json` with the same key names. | Mirrors the Mac layout; caches must not roam with enterprise profiles. |
| D9 | **Identifier `cz.stepanblaha.brink`**, credential service `cz.stepanblaha.brink`. The Mac keeps the legacy `notiondock` ids only for existing installs (BRAND.md); Windows has no legacy installs. | Clean start. |
| D10 | **Icons:** Lucide (ISC) for UI glyphs and the custom-icon "symbol" tab. SF Symbol names in shared JSON are mapped to Lucide names when present (2.6.4). | SF Symbols are licensed for Apple platforms only (legal/NOTICE.md). |
| D11 | **Hotkeys:** same defaults with Alt for ⌥ and Ctrl for ⌘ (3.g). | No Option/Command keys on Windows. |
| D12 | **Package manager npm**, Node 22, Rust stable (MSRV pinned in `rust-toolchain.toml`). | Matches `website/` and CI. |

### 2.2 Processes and windows
```
                       ┌──────────────────────── Brink.exe (one process, single instance) ───────────────────────────┐
                       │  Rust core (tokio)                                                                          │
                       │  ├─ notion::Client ── RateLimiter(0.34 s) ── reqwest ──────────────► api.notion.com/v1    │
                       │  ├─ queue::WriteQueue ── pending.json                                                        │
                       │  ├─ store::{pins, groups, settings, cache, covers} ── %APPDATA%\Brink, %LOCALAPPDATA%\Brink │
                       │  ├─ secrets (Credential Manager)        ├─ hotkeys (global-shortcut)                         │
                       │  ├─ window::{placement, hit_test, focus}├─ tray + flyout control                             │
                       │  ├─ notify (toasts, schedule, actions)  ├─ deep links / argv (single-instance)              │
                       │  └─ demo::FakeNotion (127.0.0.1:random, demo mode only)                                      │
                       │        ▲ invoke (commands)          │ emit (events)                                           │
                       └────────┼────────────────────────────┼─────────────────────────────────────────────────────────┘
          ┌─────────────────────┼───────────┬────────────────┼───────────┬────────────────┬─────────────────┐
   WebView2 windows:            │           │                │           │                │                 │
   [notch]  HUB                [capture]   [toast]          [tray]      [settings]       [onboarding] [about] [legal]
   transparent, topmost,       560×150     click-through    flyout      560×540          460×440      340×420 480×420
   tool window, click-through  borderless  borderless       320×440     normal window    normal       normal  normal
   (strip, panel, editor,      topmost     topmost          borderless  (taskbar button) (taskbar)
   database view, Today,                                     topmost
   summaries, reminders plan)                                                    [demo-backdrop] (demo mode only, bottom-most)
```
- All windows load the same Vite bundle; the route is the URL hash (`#/notch`, `#/capture`, `#/toast`, `#/tray`, `#/settings`, `#/onboarding`, `#/about`, `#/legal/:doc`, `#/backdrop`).
- `notch` is created at startup (hidden until placed). `capture`, `toast` and `tray` are created at startup hidden (fast show). `settings`, `onboarding`, `about`, `legal` are created on demand and destroyed on close.
- Single instance: `tauri-plugin-single-instance`; a second launch forwards argv (deep link, `--capture`, `--settings`) to the first.

### 2.3 Rust ↔ TypeScript boundary
All commands are `#[tauri::command] async fn`, return `Result<T, AppError>` where `AppError` serializes as `{ kind, message, transient, code? }` (NotionError mapping in 3.d.1). TS wraps every command in `src/ipc/commands.ts` with typed functions; no component calls `invoke` directly. Payload types live in `src/ipc/types.ts` and are mirrored by `serde` structs (`#[serde(rename_all = "camelCase")]` except Notion payloads, which stay snake_case as Notion sends them).

| Area | Commands | Events emitted by Rust |
|---|---|---|
| Auth | `auth_status`, `auth_save_token(token)`, `auth_disconnect`, `auth_test_connection -> { count }`, `oauth_start` (dormant), `oauth_available` | `auth://changed` |
| Notion | 3.d.4 list (`notion_*`) | — |
| Pins / groups | `pins_get`, `pins_add(pin)`, `pins_remove(id)`, `pins_update(pin)`, `pins_move_within_group(pinId, toIndex, groupId?)`, `pins_move_among_all(pinId, toIndex)`, `pins_set_group(pinId, groupId?)`, `groups_get`, `groups_add(name, emoji?)`, `groups_rename`, `groups_delete`, `groups_move(from[], to)` | `pins://changed`, `groups://changed` |
| Settings | `settings_get`, `settings_set(partial)` | `settings://changed` (whole object) |
| Panel sizes | `panel_size_get(pinId, maxW, maxH)`, `panel_size_set(pinId, w, h, maxW, maxH)`, `panel_size_reset(pinId)` | — |
| Cache | `cache_load(pinId, kind)`, `cache_save(pinId, kind, json)`, `cache_clear(pinId, kind)`, `cover_get(url, pageId) -> localPath` | — |
| Write queue | `queue_submit(op, retainOnTransientFailure) -> Outcome`, `queue_process`, `queue_pending_count` | `queue://changed { pending, lastError }` |
| Uploads | `upload_image(path or bytes, filename, contentType) -> fileUploadId` | — |
| Notch window | `notch_set_hit_rects(rects[])`, `notch_capture(on)`, `notch_request_focus`, `notch_release_focus`, `notch_reposition` | `placement://changed`, `notch://pointer {inside,x,y}`, `notch://outside-click`, `notch://open-pin {pinId}`, `notch://reminder-peek {pinId}` |
| Monitors | `monitors_list -> [{deviceName, friendlyName, rect, work, scale}]` | `monitors://changed` |
| Hotkeys | `hotkeys_apply(bindings)`, `hotkeys_suspend(on)` (while recording) | `hotkey://fired {action, index?}` |
| Capture / toast / tray | `capture_show`, `capture_hide`, `toast_show(message, isError)`, `tray_flyout_toggle`, `tray_set_count(text)` | `capture://shown` |
| Clipboard | `clipboard_read -> {kind: "text"|"image"|"empty", text?}` | — |
| Notifications | `notify_permission`, `notify_reschedule(requests[])`, `notify_cancel(ids[])` | `notify://action {action: "done"|"snooze"|"open", pinId, itemId}` |
| Autostart | `autostart_status`, `autostart_set(on)` | — |
| Windows | `window_open(name)` (settings, onboarding, about, legal:privacy/terms/notice) | — |
| Misc | `open_url(url)`, `open_in_notion(id)`, `app_version -> {marketing, build}`, `debug_*` (debug builds only) | `deeplink://open {url}` |

### 2.4 State management
- **Zustand stores** in `src/state/`: `pinsStore`, `groupsStore`, `settingsStore`, `notchStore` (phase, selectedPinId, keepOpen, addFlow, peek, layout), `summariesStore`, `todayStore`, `queueStore`, `authStore`. Each persisted store has `hydrate()` (calls `*_get`) and subscribes to its Rust event in `src/state/bridge.ts`.
- **Per-feature models** (port of the Swift view models) are plain TS classes or hooks: `DatabaseModel` (port of `DatabaseViewModel`), `PageEditorEngine`, `MiniListModel`, `TodayModel`, `QuickCaptureModel`. They take injected ports (`NotionPort`, `QueuePort`, `CachePort`, `Clock`) so tests can pass fakes.
- **No React state for persisted data** beyond what the stores expose. Optimistic updates live in the models (snapshot, mutate, submit, roll back on `failed`), exactly as `DatabaseViewModel` does (L311-321).

### 2.5 Folder layout of `windows/`
```
windows/
  DECISIONS.md  PROGRESS.md  README.md  package.json  tsconfig.json  vite.config.ts
  vitest.config.ts  playwright.config.ts  wdio.conf.ts  eslint.config.mjs  .gitignore
  fixtures/                       # JSON shared by Vitest and cargo tests (ported Swift fixtures)
    blocks-children.json  data-source-schema.json  query-page1.json  query-page2.json  search.json
  scripts/  sync-version.mjs  screens.ps1  make-tray-icons.mjs
  packaging/  msix/AppxManifest.xml  winget/StepanBlaha.Brink/<ver>/*.yaml
  docs/screens/mN/*.png
  src/
    main.tsx  routes.tsx  styles/{tokens.css, reset.css, fonts.css}
    ipc/{commands.ts, events.ts, types.ts, mock.ts}          # mock.ts = mockIPC for browser dev + Playwright
    state/{bridge.ts, pinsStore.ts, groupsStore.ts, settingsStore.ts, notchStore.ts, summariesStore.ts, todayStore.ts, queueStore.ts, authStore.ts}
    theme/{tokens.ts, motion.ts, accent.ts, notchMetrics.ts}
    domain/                                                  # pure ports of NotionKit (no React, no Tauri)
      notion/{richText.ts, propertyValue.ts, block.ts, newBlock.ts, icon.ts, row.ts, searchResult.ts, dataSourceSchema.ts, pageMeta.ts, viewFilter.ts}
      store/{pin.ts, pinOrdering.ts, pinSummary.ts, dueItem.ts, todayAggregator.ts, reminderPlanner.ts, miniList.ts, hotkeyCombo.ts, displayPreference.ts, pillStyle.ts, notchGeometry.ts, panelSize.ts, widgetSnapshot.ts}
      capture/{naturalDate.ts, naturalDatePatterns.ts, naturalDateVocabulary.ts, snooze.ts, captureRequest.ts, inboxCapture.ts, clipboardMapper.ts}
      markdown/{paragraphKind.ts, paragraphSyntax.ts, spanRuns.ts, markdownParser.ts, markdownSerializer.ts, markdownImport.ts, listNumbering.ts, slashCommand.ts, codeLanguages.ts}
      editor/{types.ts, syncPlanner.ts, plannerOrder.ts, engine.ts, engineImages.ts, engineConfig.ts}
      version.ts
    editor/                                                  # TipTap/ProseMirror layer
      schema.ts  BrinkEditor.tsx  identityPlugin.ts  snapshot.ts  loadDocument.ts
      inputRules/{blockShortcuts.ts, inlineMarks.ts}
      keymap/{enter.ts, backspace.ts, indent.ts, moveBlock.ts, marks.ts}
      plugins/{gutter.ts, placeholder.ts, toggleCollapse.ts, find.ts, slash.ts, dragHandle.ts, paste.ts, atomicGuard.ts}
      nodeViews/{TokenChip.tsx, ImageBlock.tsx, UploadingChip.tsx}
      SlashMenu.tsx  FindBar.tsx  LinkPopover.tsx  CoverStrip.tsx  EditorFooter.tsx  editor.module.css
    features/
      notch/{NotchRoot.tsx, NotchShape.tsx, edgeNotchPath.ts, useNotchHover.ts, usePhase.ts, useHitRects.ts, ResizeGrips.tsx, useResize.ts, PeekCard.tsx, PillProgress.tsx, notch.module.css}
      strip/{Strip.tsx, StripIcon.tsx, PinIcon.tsx, PinBadge.tsx, GroupSwitcher.tsx, useReorder.ts, PinContextMenu.tsx, strip.module.css}
      panel/{Panel.tsx, PanelHeader.tsx, ExpandedLayout.tsx, panel.module.css}
      pinning/{AddFlowHeader.tsx, PinSearch.tsx, DatabaseSetup.tsx, ViewBuilder.tsx, FilterRow.tsx, SortRow.tsx}
      database/{DatabaseView.tsx, DatabaseRow.tsx, DateChip.tsx, StatusPill.tsx, SnoozeMenu.tsx, useDatabaseModel.ts}
      page/{PageView.tsx, usePageEngine.ts}
      today/{TodayView.tsx, TodayRow.tsx, todayModel.ts}
      capture/{CaptureWindow.tsx, DestinationChip.tsx, DateChipPreview.tsx, quickCaptureModel.ts, ToastWindow.tsx}
      tray/{TrayFlyout.tsx, MiniListSection.tsx, miniListModel.ts}
      settings/{SettingsWindow.tsx, ConnectionSection.tsx, AppearanceSection.tsx, GeneralSection.tsx, GroupsSection.tsx, ShortcutsSection.tsx, ShortcutRecorder.tsx}
      onboarding/{OnboardingWindow.tsx, steps/*.tsx}
      about/{AboutWindow.tsx, LegalWindow.tsx, miniMarkdown.tsx}
      iconPicker/{IconPicker.tsx, emojiCatalog.ts, lucideCatalog.ts, LetterTab.tsx}
      common/{Checkbox.tsx, Spinner.tsx, Pill.tsx, Menu.tsx, Popover.tsx}
    services/{pinSummaryService.ts, reminderService.ts, inboxProcessor.ts, sound.ts, itemActions.ts}
    test/{fakeNotion/*.ts, editorHost.ts, setup.ts}
  src-tauri/
    Cargo.toml  build.rs  tauri.conf.json  capabilities/default.json  icons/  app.manifest
    src/
      main.rs  lib.rs  error.rs  paths.rs  logging.rs
      notion/{mod.rs, client.rs, rate_limiter.rs, error.rs, endpoints.rs, upload.rs, encode.rs}
      queue/{mod.rs, op.rs, executor.rs}
      store/{mod.rs, atomic.rs, pins.rs, groups.rs, settings.rs, cache.rs, covers.rs, panel_sizes.rs}
      secrets.rs
      window/{mod.rs, notch_window.rs, placement.rs, hit_test.rs, focus.rs, fullscreen.rs, styles.rs}
      hotkeys.rs  tray.rs  notify.rs  autostart.rs  deeplink.rs  clipboard.rs  sound.rs(optional)
      demo/{mod.rs, server.rs, handlers.rs, uploads.rs, content.rs}
      commands/{auth.rs, notion_cmds.rs, pins.rs, settings.rs, cache.rs, queue.rs, notch.rs, windows.rs, notify.rs, misc.rs}
    tests/{rate_limiter.rs, client.rs, queue.rs, store.rs, encode.rs, secrets_windows.rs}
```

### 2.6 Storage locations and JSON schemas
| Path | Mac counterpart | Content |
|---|---|---|
| `%APPDATA%\Brink\pins.json` | `~/Library/Application Support/NotionDock/pins.json` | `Pin[]`, sorted by `order` on save and load (PinStore.swift L227-235) |
| `%APPDATA%\Brink\groups.json` | `…/groups.json` | `PinGroup[]`, sorted by `order` |
| `%APPDATA%\Brink\pending.json` | `…/pending.json` | `PendingWrite[]` (WriteQueue.swift) |
| `%APPDATA%\Brink\settings.json` | macOS UserDefaults | `Settings` object (2.6.5) |
| `%LOCALAPPDATA%\Brink\cache\<pinId>-rows.json` | `…/cache/<pinId>-rows.json` | `Row[]` (Cache.swift) |
| `%LOCALAPPDATA%\Brink\cache\<pinId>-blocks.json` | `…/cache/<pinId>-blocks.json` | raw Notion block objects **as returned by the API** (see 9, item 1) |
| `%LOCALAPPDATA%\Brink\cache\<pinId>-editor-doc.json` | `…/cache/<pinId>-editor-doc.json` (PEE L79, 561-563) | `SyncedParagraph[]` |
| `%LOCALAPPDATA%\Brink\cache\covers\<fnv1a64-hex>` | `…/cache/covers/` (CoverCache.swift) | image bytes |
| `%LOCALAPPDATA%\Brink\logs\brink.log` | unified log subsystem `cz.stepanblaha.notiondock` | rolling log, 1 MB × 3, never the token |
| Credential Manager `notion-token.cz.stepanblaha.brink` etc. | Keychain service `cz.stepanblaha.notiondock` | 3.e |
| Demo mode: `%TEMP%\BrinkDemo-<pid>\` | `BrinkDemo-<pid>` temp folder | everything above, throwaway |

**Writes are atomic:** write `<file>.tmp` then `std::fs::rename` (MoveFileExW with replace), matching `.atomic` in Swift. Corrupt or missing files decode to empty (Swift uses `try?`), and the corrupt file is renamed to `<file>.corrupt-<unix>` before being replaced (Windows addition, logged).

**Encoding rules (must match Swift `JSONEncoder` defaults so fixtures are interchangeable):** camelCase keys as named below; optionals omitted when nil; `Date` in `pending.json` is a **Double of seconds since 2001-01-01T00:00:00Z** (Swift `.deferredToDate`; Unix seconds = value + 978307200); enums with associated values and no custom coding use Swift's synthesized shape: `{"emoji":{"_0":"🔥"}}`, `{"url":{"_0":"https://…"}}`, `{"none":{}}`, `{"end":{}}`, `{"start":{}}`, `{"after":{"_0":"<blockId>"}}`.

#### 2.6.1 `pins.json` (`NK/Store/PinStore.swift` L4-127)
```ts
type PinKind = "page" | "dataSource";           // dataSource pins store the DATA SOURCE id in notionId
type DoneKind = "checkbox" | "status";
type PinIcon = { emoji: { _0: string } } | { url: { _0: string } } | { none: {} };  // Notion icon; external and file both → url
type CustomIcon =
  | { kind: "emoji"; value: string }
  | { kind: "sfSymbol"; name: string; colorHex: number }   // Mac only; Windows maps name → Lucide (2.6.4) when reading
  | { kind: "letter"; value: string; colorHex: number }     // 1-2 chars, colorHex = 0xRRGGBB as UInt32
  | { kind: "lucide"; name: string; colorHex: number };     // Windows addition (D10)
interface ViewFilter { id: string; property: string; op: ViewFilterOperator; textValue?: string; numberValue?: number; optionValues?: string[] }
interface ViewSort { id: string; property: string; ascending: boolean }
interface DatabaseConfig {           // = a saved view
  doneProperty: string; doneKind: DoneKind; doneValue?: string; dateProperty?: string;
  showDone: boolean;                 // default false
  filters?: ViewFilter[]; sorts?: ViewSort[]; viewName?: string;
}
interface Pin { id: string; notionId: string; kind: PinKind; title: string; icon: PinIcon; order: number;
  config?: DatabaseConfig; customIcon?: CustomIcon; groupId?: string }   // groupId absent = ungrouped
```
Operations to port exactly (PinStore.swift): `add` (order = max+1), `remove`, `move(fromOffsets,toOffset)` (renumber 0..n), `move(pinID,toIndex,withinGroup)` and `moveAmongAllPins` (renumber only the scope 0..k, then sort; values may collide across groups, keep that), `update`, `setGroup` (order = max order in target group + 1).
`ViewFilterOperator` values: `checkboxIs, checkboxIsNot, statusIs, statusIsNot, statusIsAnyOf, selectIs, selectIsNot, selectIsAnyOf, dateIsToday, dateIsBeforeToday, dateWithinNext7Days, dateIsEmpty, titleContains, numberGreaterThan, numberLessThan` (`NK/Notion/ViewFilter.swift` L5-32).

#### 2.6.2 `groups.json`
`interface PinGroup { id: string; name: string; emoji?: string; order: number }`. `deleteGroup` ungroups its pins (sets `groupId` undefined), never deletes pins.

#### 2.6.3 `pending.json` (`NK/Store/WriteQueue.swift` L4-114, `NK/Notion/NewBlock.swift`, `NK/Notion/PropertyValue.swift`)
```ts
interface PendingWrite { id: string; operation: Operation; createdAt: number /* seconds since 2001-01-01 */ }
type Operation =
  | { kind: "toggleDone"; pageId: string; update: PropertyUpdate }
  | { kind: "createRow"; dataSourceId: string; title: string; extra: PropertyUpdate[] }   // missing extra → []
  | { kind: "updateProperty"; pageId: string; updates: PropertyUpdate[] }
  | { kind: "updateBlock"; blockId: string; type: string; update: BlockUpdate }
  | { kind: "appendBlock"; parentId: string; block: NewBlock }
  | { kind: "appendBlocks"; parentId: string; blocks: NewBlock[]; position: BlockPosition }  // missing → {end:{}}
  | { kind: "deleteBlock"; blockId: string };
type BlockPosition = { end: {} } | { start: {} } | { after: { _0: string } };
interface PropertyUpdate { name: string; value: PropertyValue }
type PropertyValue =   // cache-style encoding: title/rich_text are PLAIN STRINGS here
  | { type: "title"; title: string } | { type: "rich_text"; rich_text: string } | { type: "checkbox"; checkbox: boolean }
  | { type: "status"; status?: { name: string } } | { type: "select"; select?: { name: string } }   // key omitted when nil
  | { type: "date"; date?: { start: string; end?: string } } | { type: "number"; number?: number }
  | { type: string /* unsupported */ };
interface RichTextSpan { text: string; bold: boolean; italic: boolean; strikethrough: boolean; code: boolean; link?: string }
interface BlockUpdate { kind: "text" | "checked" | "richText" | "content" | "calloutContent";
  text?: string; checked?: boolean; richText?: RichTextSpan[]; language?: string; emoji?: string }
interface NewBlock { kind: "paragraph" | "toDo" | "formatted" | "callout" | "imageUpload" | "imageExternal";
  text?: string; checked?: boolean; blockKind?: string; richText?: RichTextSpan[]; language?: string; emoji?: string; id?: string; url?: string }
```
Verify the exact field encodings of `PropertyValue`, `BlockUpdate` and `NewBlock` against `PropertyValue.swift` L56-124 and `NewBlock.swift` L74-185 while porting; write a fixture per case in `windows/fixtures/queue-ops/*.json` and round-trip it in both Vitest and cargo tests.

Queue semantics (WriteQueue.swift L116-226), implemented in `src-tauri/src/queue/`:
- Strict FIFO; every enqueue and removal persists immediately.
- `submit(op, retainOnTransientFailure = true)`: append + save, drain, return `Outcome`: `saved` | `queued(message)` (transient failure, or stuck behind one; message = `lastError` or "Waiting to sync.") | `failed(message)` (Notion rejected it; dropped; caller rolls back). With `retainOnTransientFailure = false` a queued write is withdrawn (the page editor re-plans its own writes).
- One shared in-flight drain; concurrent callers await it (`tokio::sync::Mutex` + `Notify`).
- Drain loop: execute head; success → remove; transient `NotionError` (`network`, `rateLimited`, `unauthorized`, `missingToken`) → set `lastError`, **stop**, head stays; other error → drop with `failed`, continue. Empty queue → `lastError = None`.
- Execution mapping: `toggleDone`/`updateProperty` → `PATCH /pages/{id}`; `createRow` → schema GET + `POST /pages`; `updateBlock` → `PATCH /blocks/{id}`; `appendBlock(s)` → `PATCH /blocks/{id}/children`; `deleteBlock` → `DELETE /blocks/{id}`.
- **No timer in WriteQueue itself** (Swift has none). Windows addition (adapted): the hub calls `queue_process` when the network comes back (`navigator.onLine` change) and every 60 s while `pending > 0`. Record in DECISIONS.md.

#### 2.6.4 SF Symbol → Lucide map
`lucideCatalog.ts` holds about 75 Lucide names mirroring `F/IconPicker/SymbolCatalog.swift` plus a lookup table `sfToLucide` (e.g. `star.fill → star`, `checkmark.circle → circle-check`, `folder → folder`, `doc.text → file-text`, `cylinder.split.1x2 → database`, `square.grid.2x2 → layout-grid`, `plus → plus`, `xmark → x`, `pin/pin.fill → pin`, `arrow.up.right.square → square-arrow-out-up-right`, `moon.zzz → alarm-clock-off`, `calendar → calendar`, `link → link`, `paintpalette → palette`, `gearshape → settings`, `keyboard → keyboard`). Unknown names fall back to the letter icon using the pin title.

#### 2.6.5 `settings.json` (UserDefaults keys from `ND/App/Settings.swift` L157-319 and the files cited)
One flat object; same key names as the Mac UserDefaults. Missing keys take the default. Rust validates on load and on `settings_set`.
| Key | Type | Default | Mac source / note |
|---|---|---|---|
| `dockEdge` | `"left" \| "right" \| "top"` | `"right"` | Settings.swift L296 |
| `pillStyle` | `"hidden" \| "dot" \| "line" \| "percent"` | `"line"` | PillStyle.swift; the legacy `restingPillHidden` migration is Mac-only (no legacy on Windows) but port `PillStyle.resolve` for the tests |
| `pillShowsFraction` | bool | `true` | L301 ("7/12" vs "58%") |
| `displayPreference` | `"main" \| "mouse" \| "screen:<name>\t<x>,<y>,<w>,<h>"` | `"main"` | DisplayPreference.swift L17-42. Windows `<name>` = `friendlyName\|deviceName` |
| `accentPreset` | see 3.b.1 | `"blue"` | L304 |
| `dockSize` | `"small" \| "medium" \| "large"` | `"medium"` | L305 |
| `activeGroupID` | string or absent | absent (= All pins; empty string reads as absent) | |
| `badgeMode` | `"off" \| "open" \| "dueToday"` | `"open"` | L307 |
| `pillProgressMode` | `"off" \| "activeGroup" \| "lastPin"` | `"off"` | L308 |
| `notchOutline` | bool | `true` | L310 |
| `soundsEnabled` | bool | `true` | L309 |
| `menuBarListEnabled` | bool | `true` | tray flyout on left click |
| `menuBarShowOpenCount` | bool | `false` | `F/MenuBar/MenuBarEvents.swift` L10 (`bool(forKey:)` defaults false); on Windows shown as a tray tooltip + overlay badge |
| `showTodayPin` | bool | `true` | L313 |
| `remindersEnabled` | bool | `false` | |
| `reminderHour` | int 0-23 | `9` | `ReminderSettings.dateOnlyHour` |
| `morningSummaryEnabled` | bool | `false` | |
| `morningSummaryMinutes` | int 0-1439 | `480` | 8:00 |
| `peekForReminders` | bool | `true` | |
| `lastOpenedPinID` | string or absent | absent | used by toggle hotkey, pill "Last pin", tray target and **clipboard append** (fixes the Mac key mismatch, section 9) |
| `quickCaptureLastPinID` | string or absent | absent | Mac key `NotionDock.quickCapture.lastPinID` |
| `onboardingCompleted` | bool | `false` | OnboardingView.swift L10 |
| `panelSizes` | `{ [pinId]: [width, height] }` | `{}` | PanelSizeStore.swift (Mac key `panelSizes`); values in logical px |
| `hotkeys` | `{ [action]: "<accelerator>" }` | defaults in 3.g | Mac keys `hotkey.<action>` = `"<keyCode>:<modifiers>"`; Windows stores Tauri accelerator strings |
| `hideInFullScreen` | bool | `true` | Windows-only (3.a.3) |

#### 2.6.6 Shared inbox and widget snapshot
The Mac App Group files (`widget-snapshot.json`, `inbox.jsonl`, `NK/Shared/*`) exist for the widget and the Share extension. On Windows the share target and protocol handler run **inside the Brink process** (3.l), so no inbox file is needed in v1. Port `InboxCapture` (captureText, destination, plan, toggleOperation) and `WidgetSnapshot.build` to TS anyway: they are pure, they are covered by `SharedDataTests`, and the deferred widget (3.m) will need the snapshot. If a second process ever writes captures (MSIX share target activation in a separate instance), use `%LOCALAPPDATA%\Brink\inbox.jsonl` with a named mutex `Local\BrinkInbox` as the NSFileCoordinator equivalent; same line format (ISO-8601 dates, sorted keys).

---

## 3. The hard parts

### 3.a The notch window on Win32

**Goal:** one transparent, borderless, always-on-top tool window per app (the "notch window") that draws the morphing black shape, never appears in Alt-Tab / Win+Tab / the taskbar, does not steal focus when hovered or clicked on a pin, can take keyboard focus when the user types in the panel, and lets clicks pass through everywhere outside the current shape.

#### 3.a.1 Window size strategy
The Mac app uses one `NSPanel` whose frame is fixed and big enough for the largest expanded panel; only the drawn shape and the mouse pass-through region change (NotchPanel.swift L4-8; "the window never moves while resizing", DockController L351-353). Do the same on Windows: **size the notch window once per placement**, using the Mac sizes (`positionPanel`, DockController L354-392):
- **Side edges:** window = `(min(900, work.width), work.height)` logical px, flush with the edge, vertically centered on the work area.
- **Top edge:** `stripLen = stripMetrics(N).length + 2 * stripFlare`; width = `min(monitor.width, max(900 + 120, stripLen + 80))`; height = from the monitor top to the bottom of the work area (the Mac uses `frame.maxY - visible.minY`, i.e. down to the Dock, which it never covers). Recompute when the pin count changes on the top edge (DockController L203-220).
- Layout anchor inside the window: `h/2` on side edges; on top `anchorX - window.left`. Never resize the HWND during an animation (resizing a WebView2 window per frame stutters and flickers). Changes of the window rect happen only when: the edge, display, panel size limits, DPI, monitor layout or taskbar work area change.

#### 3.a.2 Window creation (Tauri config + Win32 fix-ups)
`windows/src-tauri/tauri.conf.json` (excerpt):
```json
{
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "label": "notch",
        "url": "index.html#/notch",
        "transparent": true,
        "decorations": false,
        "shadow": false,
        "resizable": false,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "focus": false,
        "visible": false,
        "maximizable": false,
        "minimizable": false,
        "closable": false,
        "visibleOnAllWorkspaces": true,
        "dragDropEnabled": true
      }
    ],
    "security": { "csp": "default-src 'self'; img-src 'self' data: blob: https:; connect-src ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'" }
  }
}
```
Then in Rust (`src-tauri/src/window/notch_window.rs`), right after creation and before `show()`, apply the Win32 styles Tauri does not expose, using the `windows` crate (`Win32_UI_WindowsAndMessaging`, `Win32_Graphics_Dwm`, `Win32_UI_HiDpi`):

| Flag | Where | Why |
|---|---|---|
| `WS_EX_TOOLWINDOW` | `SetWindowLongPtrW(GWL_EXSTYLE)` | Hides from Alt-Tab and Win+Tab (with `skipTaskbar`). Do **not** set `WS_EX_APPWINDOW`. |
| `WS_EX_NOACTIVATE` | GWL_EXSTYLE | Clicking the window does not activate it, so hovering and clicking pins never steals focus from the app the user is in (the Mac uses `styleMask [.nonactivatingPanel, .borderless]`, level `statusBar + 1`, `canBecomeKey = true`, `canBecomeMain = false`, NotchPanel.swift L12-44). Removed temporarily when the user needs to type (3.a.5). |
| `WS_EX_TOPMOST` | via `alwaysOnTop` | Above normal windows. Re-assert with `SetWindowPos(HWND_TOPMOST, …, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE)` on `WM_DISPLAYCHANGE`, on a foreground-window change (`SetWinEventHook(EVENT_SYSTEM_FOREGROUND)`), and every 2 s while visible, because other topmost windows (taskbar flyouts, games) can take z-order. |
| `WS_EX_LAYERED` | set by Tauri for `transparent` | Keep. Do not call `SetLayeredWindowAttributes` (WebView2 handles alpha). |
| `WS_EX_TRANSPARENT` | toggled by `set_ignore_cursor_events` | This is how click-through is implemented (3.a.4). |
| `DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_DONOTROUND` | `DwmSetWindowAttribute` | Windows 11 would otherwise round the HWND corners. |
| `DWMWA_TRANSITIONS_FORCEDISABLED = TRUE` | DwmSetWindowAttribute | No DWM fade when shown/hidden. |
| `DWMWA_EXCLUDED_FROM_PEEK = TRUE` | DwmSetWindowAttribute | Stays out of Aero Peek. |
| `DWMWA_CLOAK` | not used | `ShowWindow(SW_SHOWNOACTIVATE)` is used instead of `show()` so the first show does not activate. |

WebView2 background must be transparent: Tauri sets `DefaultBackgroundColor` to transparent when `transparent: true`; also set `html, body { background: transparent }` in `notch.css`.

Process DPI awareness: Tauri 2 apps are per-monitor DPI aware v2 by default through the embedded manifest. Verify in M2 by calling `GetAwarenessFromDpiAwarenessContext(GetThreadDpiAwarenessContext())` once at startup and logging it; it must be `DPI_AWARENESS_PER_MONITOR_AWARE` (v2 context). If not, add `windows/src-tauri/app.manifest` with `<dpiAwareness>PerMonitorV2</dpiAwareness>` and embed it with `tauri-build`'s `WindowsAttributes::app_manifest`.

#### 3.a.3 Placement: monitors, DPI, taskbar
Rust module `src-tauri/src/window/placement.rs` owns all geometry in **physical pixels**, and sends the frontend logical sizes.
- Enumerate monitors with `EnumDisplayMonitors` + `GetMonitorInfoW` (`rcMonitor` = full rect, `rcWork` = work area) + `GetDpiForMonitor(MDT_EFFECTIVE_DPI)`; scale = dpi / 96. Identify monitors by the device name from `MONITORINFOEXW.szDevice` plus the rect, so the "display choice" setting survives reboots (store `{ deviceName, friendlyName, rect }`, fall back to primary if not found, like the Mac falls back to the main screen).
- **Which rect to dock to** (mirror `NotchGeometry.windowFrame`, Sources/NotionKit/Store/NotchGeometry.swift): **left/right** edges use the *visible* frame (Windows: `rcWork`, which excludes the taskbar) and are **vertically centered** in it (`y = rcWork.top + (rcWork.height - windowHeight) / 2`, x flush with `rcWork.left` or `rcWork.right - windowWidth`). The **top** edge uses the *full* frame (Windows: `rcMonitor.top`), because on the Mac it sits above the menu bar.
  - Taskbar detection: `SHAppBarMessage(ABM_GETTASKBARPOS)` for the primary taskbar, `rcMonitor` vs `rcWork` comparison for secondary ones, `ABM_GETSTATE & ABS_AUTOHIDE` for auto-hide.
  - Taskbar on the **top** edge (Windows 10 only; Windows 11 forces bottom) and not auto-hide: use `rcWork.top` for the top notch, or it would cover the taskbar.
  - Taskbar on the same side edge and **auto-hide**: `rcWork` equals `rcMonitor` there, so the notch sits on the monitor edge; when the auto-hidden taskbar slides in (its `Shell_TrayWnd` / `Shell_SecondaryTrayWnd` rect intersects the notch rect), collapse to resting. Topmost z-order is re-asserted after it hides again.
- **Top edge:** there is no hardware notch on Windows. The top-edge notch is horizontally centered on the monitor (`window x = clamp(rcMonitor.centerX - windowWidth / 2, rcMonitor.left, rcMonitor.right - windowWidth)`, i.e. `windowFrame(.top, topLeading: false)` with `topAnchorX` = monitor center; the shape center inside the window is then the window's midpoint (`NotchGeometry.center(anchor:, leading: false, …)`)). The Mac "merge with hardware notch" option is hidden on Windows.
- **Left/right edge:** vertical position comes from vertical centering in the work area (above), computed in logical points then multiplied by the monitor scale.
- **DPI change:** handle `WM_DPICHANGED` (the window moved to another monitor or the user changed scaling): recompute placement from scratch for the target monitor, ignore the OS-suggested rect. Also listen to `WM_DISPLAYCHANGE` and `WM_SETTINGCHANGE` with `SPI_SETWORKAREA` (taskbar moved/resized) and recompute. Debounce all three by 250 ms. Emit `placement://changed` with `{ edge, scale, windowLogical: {w,h}, anchorLogical: {x,y} }` to the frontend.
- **Mixed DPI multi-monitor:** never span two monitors; the window rect is always fully inside one monitor.
- **Full-screen apps:** detect with `SHQueryUserNotificationState` (`QUNS_BUSY`, `QUNS_RUNNING_D3D_FULL_SCREEN`, `QUNS_PRESENTATION_MODE`) polled every 2 s, plus a foreground-window check (foreground HWND rect equals `rcMonitor` of the notch's monitor and its class is not `Progman`/`WorkerW`). Mac default is to stay visible over full-screen apps (BRIEF 6.2 `.fullScreenAuxiliary`); on Windows a topmost window over an exclusive-fullscreen D3D game is not possible and is rude over borderless games, so: if `hideInFullScreen` (new setting, default **true** for D3D full screen, false for presentation and borderless video) the notch fades to hidden and comes back when full screen ends. Record as "adapted".

#### 3.a.4 Click-through outside the shape
WebView2 cannot do per-pixel hit testing through a transparent window: the HWND either receives all mouse input or (with `WS_EX_TRANSPARENT`) none. So the shape's hit rect drives a toggle:
1. The frontend computes the **hot rects** exactly like `updatePassThrough()` (DockController L886-896): `hotRect(phase)` = the shape's bounding rect including flares (`NotchGeometry.boundingRect`) **outset by `hotZonePadding = 30` on all sides (unscaled, Theme.swift L133)**; in resting phase the metrics are always the **Line** pill's (`hotRestingMetrics`, NotchLayout L38) so Dot and Hidden pills are as easy to hit; in strip phase with a peek card showing, also the peek rect (`peekRect(peekFrame, itemCount: 3)`). It recomputes on every phase, layout or peek change and sends the rects with `invoke('notch_set_hit_rects', { rects })` (an array, because the peek card and the strip are separate rects).
2. Rust (`src-tauri/src/window/hit_test.rs`) runs a **cursor poll on a dedicated thread at 60 Hz** (`GetCursorPos`, 16 ms; drop to 10 Hz when the cursor has been > 200 px from every rect for 1 s). When the cursor enters any rect (converted to physical px) it calls `window.set_ignore_cursor_events(false)`; when it leaves all rects it calls `set_ignore_cursor_events(true)`. It also emits `notch://pointer` `{ inside: bool, x, y }` events (throttled to changes only) so the frontend's hover state machine works even while the window ignores the mouse.
3. Why polling, not `WH_MOUSE_LL`: a low-level mouse hook runs on every mouse move system-wide, adds latency to the whole desktop if the callback is slow, and is flagged by some antivirus tools. 60 Hz polling costs well under 0.1 % CPU. Keep the hook as a documented fallback only.
4. While a resize is in progress the window must keep receiving the mouse (the Mac forces `ignoresMouseEvents = false` while `resizeSession != nil`, L449). Likewise while a drag is in progress inside the window (reorder, resize grip, text selection), keep cursor events enabled until `pointerup`, even if the cursor leaves the rect (the frontend sends `notch_capture(true/false)`).
5. Outside-click collapse (the Mac collapses the panel on a click outside, BRIEF 6.2): with click-through on, the window never sees outside clicks. Detect them in Rust: the poll thread checks `GetAsyncKeyState(VK_LBUTTON)` transitions while the phase is expanded and the cursor is outside all rects, then emits `notch://outside-click`. Same for `VK_RBUTTON`.

#### 3.a.5 Focus for typing
- Default state: `WS_EX_NOACTIVATE` set. Hover, pin clicks, checkbox ticks and peek ticks never activate Brink.
- When the user clicks into a text input (editor, quick add, search, find bar) the frontend calls `invoke('notch_request_focus')`. Rust removes `WS_EX_NOACTIVATE`, calls `SetForegroundWindow(hwnd)` (allowed because the click just happened on our window; if it fails, use the `AttachThreadInput` + `SetForegroundWindow` + detach fallback), then `window.set_focus()`. The WebView's focused element keeps focus.
- When the panel collapses (Esc, outside click, hotkey toggle) Rust re-adds `WS_EX_NOACTIVATE` and restores the previous foreground window, saved before taking focus (`GetForegroundWindow`), with `SetForegroundWindow(prev)` if it still exists. This mirrors the Mac behavior of returning focus to the previous app.
- Global hotkeys that open the panel for typing (quick capture, open pin) are allowed to take foreground because the hotkey message gives the process the foreground right.
- Edge case: IME candidate windows need the window active; they work once focus is requested.

#### 3.a.6 Out of Alt-Tab, Win+Tab, taskbar, screen sharing
- Alt-Tab / Win+Tab / taskbar: `WS_EX_TOOLWINDOW` + `skipTaskbar` + no owner window. Verify with a WebdriverIO check that calls a debug command `debug_window_styles` and asserts the bits, and a manual Alt-Tab screenshot.
- Virtual desktops: `visibleOnAllWorkspaces` is a no-op on Windows; a tool window still belongs to one virtual desktop. Pin it to all desktops via the undocumented `IVirtualDesktopPinnedApps` only if cheap; otherwise mark "adapted: shows on the desktop where Brink started; moves when the user switches with the hotkey". Default: re-show the window on the current desktop when a hotkey fires (`IVirtualDesktopManager::IsWindowOnCurrentVirtualDesktop`, documented API; if false, hide and re-create position on the current desktop).
- Screen capture: leave `SetWindowDisplayAffinity` alone (users want the notch in their screenshots, like on the Mac).

### 3.b The morphing shape, motion and phases

#### 3.b.1 Design tokens (`ND/Theme/Theme.swift`, `ND/App/Settings.swift` L45-100) → `src/styles/tokens.css` + `src/theme/tokens.ts`
| Token | Value | Source |
|---|---|---|
| `--notch`, `--bg` | `#000000` | Theme L10-11 |
| `--raised` (code, callouts, chips, sidebar) | `#1C1C1E` | L12 |
| `--text` | `#FFFFFF` | L13 |
| `--text-2` | `#808080` | L14 |
| `--text-3` | `rgba(255,255,255,0.32)` | L15 |
| `--hover` / `--selected` / `--divider` / `--checkbox-border` | white @ 0.16 / 0.22 / 0.10 / 0.40 | L16-22 |
| `--danger` / `--success` | `#FF453A` / `#00FF88` | L23-24 |
| `--inline-code` | `#FF7B72` | EditorStyling.swift |
| Accent presets | pink `#FF375F`, red `#FF453A`, orange `#FF9F0A`, yellow `#FFD60A`, green `#32D74B`, teal `#40C8E0`, **blue `#0A84FF` (default)**, indigo `#5E5CE6`, purple `#BF5AF2`, offWhite "Off-White" `#F2F2F0`, system "System accent" | Settings.swift L65-100 |
| System accent on Windows | `UISettings.GetColorValue(UIColorType::Accent)` via Rust (`windows` crate `UI_ViewManagement`), refreshed on `WM_SETTINGCHANGE` "ImmersiveColorSet" | adapted |
| Fonts | `title` 15 semibold, `body` 14, `small` 12, `caption` 11 medium, × fontScale (0.93 / 1 / 1.1) | Theme L27-35 |
| Font family | `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`; mono `"Cascadia Mono", Consolas, monospace` (SF Pro and SF Mono on the Mac; BRAND.md "system font") | adapted |
| Metrics | radius 4, panelRadius 8, rowHeight 30, hPadding 12 | Theme L37-42 |
| Hover row | radius 4, `--selected` when selected else `--hover` on hover, easeOut 0.12 s | Theme L199-218 |
| Buttons | brightness +0.35 on hover, opacity 0.6 pressed, pointer cursor, easeOut 0.12 s | Theme L222-250 |

#### 3.b.2 Notch metrics (Theme.swift L97-178), `s` = metricsScale (0.85 / 1 / 1.2)
| Metric | Value |
|---|---|
| Resting Line | depth `8s`, length `80s`, corner `4s`, flare `6s` |
| Resting Percent | side: depth `34s`, length `20s`; top: depth `18s`, length `46s`; corner `9s`; flare `6s` |
| Resting Dot | depth 8, length 8, corner 4, flare 0 (**unscaled**, keep) |
| Resting Hidden | Line metrics, shape opacity 0 |
| iconSize / iconSpacing / stripPadding | `28s` / `8s` / `14s` |
| stripDepth / stripCorner / stripFlare | `56s` / `18s` / `14s` |
| Strip length for N icons (N includes Today when shown) | `2*stripPadding + (iconSize + iconSpacing + 6s) + N*iconSize + max(N-1,0)*iconSpacing + (iconSpacing + iconSize)` |
| Default expanded size | side `400s × 560s` (w × h), top `560s × 400s` |
| expandedCorner / expandedFlare | `22s` / `20s` |
| Expanded metrics | side: depth = width, length = height; top: depth = height, length = width |
| Panel size limits | minWidth 300, maxWidth 900, minHeight 240; `w = min(max(w,300), max(300, min(900, availW)))`, `h = min(max(h,240), max(240, maxH))` (PanelSizeStore.swift L5-17) |
| maxPanelSize | `NotchGeometry.maxLength(windowLength, anchor, leading, flare = expandedFlare, margin = 8)`: centered `max(0, 2*(min(anchor, L-anchor) - flare - 8))` (NotchLayout L60-69) |
| hotZonePadding | 30 (unscaled) |
| hoverOutDelay | 0.35 s |
| Peek card rect | width `min(220s, winW - 12)` (top) or `min(220s, winW - stripDepth - 12)` (sides); top: `x = clamp(icon.midX - w/2, 4, max(winW-w-4, 4))`, `y = stripDepth + 8`; sides: `x = winW - stripDepth - 8 - w` (right) / `stripDepth + 8` (left), `y = clamp(icon.midY - h/2, 4, max(winH-h-4, 4))`; height `(44 + itemCount*20) * fontScale` (NotchLayout L75-90, PeekTooltip L18-21) |

All numbers are logical px on Windows (CSS px at the monitor's DPI scale). Port the geometry as `src/domain/store/notchGeometry.ts` with `bodyRect`, `boundingRect`, `center(anchor, leading, length)`, `maxLength`, and test it with the `WindowCustomizationTests` cases (3.k).

#### 3.b.3 SVG path generator (port of `EdgeNotchShape.path(in:)`, L36-75)
All five inputs (`depth, length, corner, flare, center`) are animatable, exactly like `animatableData`. The path is traced as if on the **right** edge, then mirrored (left) or rotated (top).
```ts
// src/features/notch/edgeNotchPath.ts
export type Edge = "left" | "right" | "top";
export interface NotchParams { depth: number; length: number; corner: number; flare: number; center: number }

export function edgeNotchPath(w: number, h: number, edge: Edge, p: NotchParams): string {
  const vw = edge === "top" ? h : w;              // virtual "right edge" frame; top swaps axes
  const half = Math.max(p.length, 0) / 2;
  const T = p.center - half, B = p.center + half;
  const cr = Math.max(0, Math.min(p.corner, Math.min(Math.max(p.depth, 0), half)));
  const fl = Math.max(0, Math.min(p.flare, half));
  const d = Math.max(p.depth, cr);
  const E = vw, F = Math.max(0, E - d);
  const f = Math.min(fl, Math.max(0, d - cr));   // flares need room beside the far corner
  // [x, y] in the virtual frame; map() turns them into window coordinates
  const map = (x: number, y: number): [number, number] =>
    edge === "right" ? [x, y] : edge === "left" ? [vw - x, y] : [y, vw - x];
  const P = (x: number, y: number) => map(x, y).map(n => +n.toFixed(3)).join(" ");
  const sweep = (s: 0 | 1) => (edge === "left" ? (1 - s) : s);  // mirroring flips arc direction; rotation keeps it
  return [
    `M ${P(E, T - f)}`,
    `A ${f} ${f} 0 0 ${sweep(1)} ${P(E - f, T)}`,          // concave flare (circle outside the body)
    `L ${P(F + cr, T)}`,
    `A ${cr} ${cr} 0 0 ${sweep(0)} ${P(F, T + cr)}`,        // convex far corner
    `L ${P(F, B - cr)}`,
    `A ${cr} ${cr} 0 0 ${sweep(0)} ${P(F + cr, B)}`,        // convex far corner
    `L ${P(E - f, B)}`,
    `A ${f} ${f} 0 0 ${sweep(1)} ${P(E, B + f)}`,           // concave flare
    "Z",
  ].join(" ");
}
```
- The top-edge transform is `(vx, vy) → (vy, vw - vx)` with `vw = window height` (EdgeNotchShape L72-73). It is a rotation (determinant +1), so sweep flags are unchanged; the left mirror (determinant -1) inverts them.
- Unit-test it: (1) left output equals the right output mirrored (`x → w - x`) point by point; (2) the path's bounding box equals `NotchGeometry.boundingRect` (body rect with `depth = max(depth, corner)`, outset by `flare` along the edge); (3) snapshot strings for resting/strip/expanded on all edges. Also render-compare against `marketing/screenshots/` at Medium.
- Rendering stack (NotchRootView L60-104): `<svg>` with a `<clipPath>` of the shape; a black fill of the shape with `filter: drop-shadow(0 2px 4px rgba(0,0,0,.45))` resting or `drop-shadow(0 2px 14px rgba(0,0,0,.45))` otherwise (draw it on a layer behind, unclipped); then pill progress; then the phase body (HTML in a `foreignObject`-free overlay `div` clipped with `clip-path: path(...)` using the same string); then resize grips. When `notchOutline` is on, stroke the shape 1 px white @ 0.22 (resting) or 0.14 (open), no pointer events.
- Leave enough transparent margin inside the window for the 14 px shadow (the Mac window has margin by construction because it is much larger than the shape).

#### 3.b.4 Motion (Theme.Motion, Theme.swift L45-95) → `src/theme/motion.ts`
SwiftUI `spring(response, dampingFraction)` with mass 1 converts to `stiffness = (2π / response)²`, `damping = 4π · dampingFraction / response`.
| Name | SwiftUI | Motion transition | Used for |
|---|---|---|---|
| `unfold` | spring(0.62, 0.72) | `{ type: "spring", stiffness: 102.7, damping: 14.59, mass: 1 }` | shape morph between phases (every `refreshContent`) |
| `contents` | spring(0.48, 0.8) | `{ type: "spring", stiffness: 171.3, damping: 20.94, mass: 1 }` | icons and content appearing, peek card, pill fill |
| `list` | spring(0.42, 0.82) | `{ type: "spring", stiffness: 223.8, damping: 24.53, mass: 1 }` | rows added, removed, reordered |
| `crossfade` | easeInOut 0.16 s | `{ duration: 0.16, ease: "easeInOut" }` | switching pin content while expanded, add flow in/out |
| `phaseTransition(edge)` | insert: opacity + offset 14 toward the edge (`right +x`, `left -x`, `top -y`) with `contents` delayed 0.06 s; remove: same offset, `contents`, no delay | `AnimatePresence` variants | phase body enter/exit |
| `rowTransition` | opacity + y -6 | variants | row insert/remove |
| `stagger(i)` | `min(i * 0.045, 0.18)` s | `delay` | strip icons appearing (y 6 → 0, opacity 0 → 1) |
| Reduce Motion | springs → `linear(0.001)`, transitions → opacity only, stagger 0 | `useReducedMotion()` OR the Rust value of `SPI_GETCLIENTAREAANIMATION` (Settings → Accessibility → Animation effects) | everywhere |

Implementation: one `useSpring` per shape parameter (`depth, length, corner, flare, center`) with the `unfold` config; a `useTransform` over all five calls `edgeNotchPath` and feeds `d` and the CSS `clip-path`. While a resize is in progress, set the values with `.jump()` (no animation), like the Mac (`isResizing` disables the morph, NotchRootView L52, L99-101). Pill style changes animate with `contents` (L102). Opening and closing are mirror images because the same spring runs in both directions.

#### 3.b.5 Phase state machine (`DockController.swift`)
```
           cursor enters hotRect(resting)                        click icon / "+" / peek card / hotkey / deep link / reminder-open
 resting ───────────────────────────────► strip ────────────────────────────────────────────────────────────────► expanded
    ▲   ◄── 0.35 s after cursor leaves ──┘  ▲                                                                        │
    │       hotRect(strip) ∪ peekRect⁺⁸,    │ collapse(): cursor inside hotRect(strip) → strip, else resting          │
    └───── no menu open, no aux popover ────┴─────────────────────────────────────────────────────────────────────────┘
```
| Rule | Value / behavior | Source |
|---|---|---|
| resting → strip | immediately when the cursor enters `hotRect(.resting)`; cancels any pending collapse | L909-914 |
| strip → resting | cursor outside `hotRect(.strip)` and outside `peekRect` outset by 8, no menu tracking, not over an auxiliary popover → `scheduleCollapseToResting()` after **0.35 s**; when it fires it re-checks phase and menus (not the cursor); a move back inside cancels it | L915-937 |
| any → expanded | strip icon click (`selectPin`), "+" (add flow), peek card click, hotkey, `openPinInNotchRequested` (deep link, tray "Open in notch", notification Open), context menu Keep open / Change Icon… / Edit View…, onboarding "Add a page" | L115-136, L308-332, L534-678 |
| Same pin again while expanded | `collapse(force: true)` (toggle) | L661-664, L326-329 |
| expanded → collapse(force: false) | outside left/right click, a click in another Brink window that is not an auxiliary popover, Esc (swallowed) | L988-1030 |
| Keep open (`isPanelPinned`) | `collapse(force: false)` is ignored while pinned; header pin button and context menu toggle it | L680-689, L731-736 |
| expanded → collapse(force: true) | header ✕, unpinning the selected pin, add flow done/cancel, database setup save/cancel, Edit View save/cancel, icon picker close | L259-261, L558-599, L821-830 |
| Leaving expanded never happens on mouse-out | while expanded, mouse moves only cancel the collapse timer | L922-923 |
| Screen/layout/edge/size change | expanded → resting; otherwise refresh | L138-145, L417-433 |
| `setPhase` side effects | leaving expanded: stop polling, refresh the closed pin's summary; any non-expanded phase clears `selectedPinID`, `isPanelPinned`, `addFlowContent`; entering expanded takes focus (3.a.5), leaving restores the previous app | L703-726, L941-974 |
| Display "with mouse" | follow the cursor's monitor **only while resting** | L899-903, L910 |
| Expanded center on side edges | `half = expandedLength/2 + expandedFlare + 8`; if `winH <= 2*half` → `winH/2`, else clamp the clicked icon's midY to `[half, winH - half]`; hotkeys and menu use `winH/2` | L691-697 |

Implement as a reducer in `src/features/notch/usePhase.ts` (pure, unit-tested with fake timers) driven by `notch://pointer`, `notch://outside-click`, `hotkey://fired` and UI events.

#### 3.b.6 Peek card (`F/Notch/PeekTooltip.swift`, `NotchState.swift`, StripView L162-165, L235-247)
- **Dwell 0.5 s** on a strip icon before showing (task sleeps 500 ms; leaving cancels). Only the primary strip peeks, not the rail inside the expanded panel (the rail shows the title as a native tooltip instead).
- **Dismiss 0.3 s** after leaving the icon, unless the cursor is on the card (`peekCardHovered`) or the peeked pin changed. Leaving the card schedules the same 0.3 s dismiss.
- **Click** on an icon first clears the peek, then selects. **Click on the card** opens that pin (expanded).
- Visible only in strip phase. Transition: opacity + scale 0.92 anchored on the edge side, `contents` spring; reduce motion → opacity.
- Content: title (small, semibold, one line); subtitle "Loading…" (no summary) / "No tasks" (total 0) / "All done" (none open) / "N open"; up to 3 `summary.nextRefs` rows, each a 12×12 checkbox (radius 3, accent fill when checked, 1 px `--checkbox-border` otherwise) + title (small; checked rows `--text-2` + strikethrough, else white @ 0.9); ticked ids are kept locally until the next refresh. Card padding 12 × 10, radius 14, black fill, 1 px `--divider` stroke. Row help text "Mark done" / "Done".
- Ticking in the card: Today items resolve their real pin id from the Today digest; play the tick; submit via the write queue (`InboxCapture.toggleOperation`); any outcome posts `pinContentDidChange`; failure shows an error toast (DockController L803-819).
- **Reminder peek:** when a reminder fires and `peekForReminders` is on, open the strip with that pin's peek for **3 s**, then clear the peek and fold to resting if still in strip, no menu open and the cursor is outside the strip hot zone (DockController L1090-1103).

#### 3.b.7 Pill progress and badges
- Pill progress (NotchRootView L106-151, PillStyle.swift L27-40): measure `lastPin` → that pin's summary, `activeGroup` → all pins in the strip; ratio = Σdone / Σtotal, nil if total 0 or mode off. Drawn only for Line and Percent: accent @ 0.7 (line, thickness `max(2, 3s)`) or @ 0.4 (percent wash, full thickness); length `pillLength × ratio`, growing from the **bottom** on side edges and from the **left** on top; visible only when resting; animated with `contents`. Percent label: "7/12" when `pillShowsFraction`, else "58%" (rounded); total 0 → "0/0" / "0%"; no counts → "–". Font 10 × fontScale semibold, tabular digits, `--text-2`, min scale 0.7.
- Badge (StripView L263-291): count = `openCount` (open) or `dueTodayCount` (dueToday), hidden at 0, "99+" above 99; 9 × fontScale bold white, padding 0 4, min 14×14, accent capsule with 1.5 px black stroke, top-right offset (+6, −5), scale + opacity transition, no pointer events.

### 3.c The editor sync on ProseMirror (TipTap)

The Mac editor is an `NSTextView` over one `NSTextStorage` where **one paragraph = one Notion block**; kind, depth and identity are per-paragraph attributes and Markdown is only an input shortcut (`NK/Markdown/EditorDocument.swift` L51-63, `ParagraphSyntax.swift` L115-118). The Windows editor keeps that model exactly. Abbreviations: ED = EditorDocument.swift, EC = EditorCommands.swift, ECB = EditorCommands+Blocks.swift, EI = EditorInput.swift, ESP = EditorSyncPlanner.swift, PEE = PageEditorEngine.swift, PS = ParagraphSyntax.swift, SC = SlashCommand.swift, all in `NK/Markdown/`; ETV = `F/PageView/EditorTextView*.swift`, STY = `F/PageView/EditorStyling.swift`.

#### 3.c.1 Layers
| Layer | Windows file(s) | Port of | Tests |
|---|---|---|---|
| Pure model types (`ParagraphKind`, `DocParagraph`, `SyncedParagraph`, spans) | `domain/editor/types.ts`, `domain/markdown/paragraphKind.ts` | PS, ESP L3-67 | ParagraphSyntaxTests |
| Planner | `domain/editor/syncPlanner.ts`, `plannerOrder.ts` | ESP | EditorSyncPlannerTests, MoveBlockTests (planner part) |
| Engine (load, debounce, passes, executor, refresh, mass-delete) | `domain/editor/engine.ts`, `engineImages.ts` | PEE, PEE+Images | PageEditorEngineTests, ImageBlockTests |
| Document adapter (PM doc ↔ `DocParagraph[]`, load from `SyncedParagraph[]`, stamp ids) | `editor/snapshot.ts`, `editor/loadDocument.ts`, `editor/identityPlugin.ts` | ED | EditorDocumentTests |
| Commands, keymap, input rules | `editor/keymap/*`, `editor/inputRules/*`, `editor/plugins/*` | EC, ECB, EI | WYSIWYGTests, EditorFeatureTests, MoveBlockTests (commands) |
| UI | `editor/BrinkEditor.tsx`, node views, `SlashMenu.tsx`, `FindBar.tsx` | `F/PageView/*` | Playwright |

The engine talks to the document only through an interface (`EditorDocPort`: `paragraphs()`, `load(synced, preserveSelection)`, `setBlockId(localId, id)`, `clearBlockId(localId)`, `restoreToken(...)`, `blockIdForLocal(localId)`, `editGeneration`, `onLocalEdit`) so the planner and engine tests run in Node without a DOM, using a ported `TestEditorHost` (`src/test/editorHost.ts`) that implements the same port over a plain array model.

#### 3.c.2 Schema
```ts
// editor/schema.ts — flat document, no nesting in the PM tree (depth is an attribute)
doc:   { content: "block+" }
block: { content: "inline*", group: "block", defining: true,
         attrs: { localId: string /* uuid, stable while the paragraph exists */,
                  blockId: string | null /* Notion id; null = not yet in Notion */,
                  kind: string  /* ParagraphKind.tag: paragraph | heading_1..3 | bulleted_list_item | numbered_list_item
                                   | to_do | to_do:checked | quote | code:<lang> | divider | toggle | callout:<icon>
                                   | token:<type> | image:<encoded source> */,
                  depth: 0 | 1 | 2 | 3,
                  tokenTitle: string | null, collapsed: boolean /* toggles only, local, never synced */ } }
text marks: bold, italic, strike, code, link{href}      // no underline, no color (RichTextSpan has none, see 9)
hard_break  // soft line break inside a block (U+2028 on the Mac); inside code it is the line separator
```
- `kind` tags and Notion `apiType` mapping are exactly `ParagraphKind` (PS L6-113): `to_do` vs `to_do:checked`, `code:<lang>`, `callout:<icon>` (`""` = non-emoji icon kept as is; default 💡), `token:<type>`, `image:<file:URL|external:URL|upload:ID>`.
- `hasText` is false for divider, token, image: these render through node views (`TokenChip`, `ImageBlock`, `UploadingChip`) with `atom`-like behavior enforced by `atomicGuard.ts` (port of ETV L40-47: reject typing into token/image/divider lines unless the replacement covers the whole line).
- `canHaveChildren` is true for paragraph, bulleted, numbered, to_do, quote, toggle, callout (PS L59-66); headings, code, divider, token, image cannot.
- Code blocks: one block, lines separated by `hard_break`; marks are disallowed inside code (`marks: ""` enforced by a plugin that strips marks when `kind` starts with `code`).

#### 3.c.3 Identity rules (port of `processEdit`, ED L503-615)
ProseMirror does not carry "which characters existed before"; implement the rules with an `appendTransaction` plugin (`identityPlugin.ts`) that compares the old and new docs through the transaction's `mapping`:
1. **Original-position rule.** For each block in the new doc, map its start back through `tr.mapping.invert()`. If its first original character (the first position that existed before the step, i.e. maps back without `deleted`) belonged to old block X, the block takes X's identity (`localId`, `blockId`, `kind`, `depth`). PM's own split semantics already give the right answer for the common cases: `splitBlock` keeps attrs on the first half when we pass `keepAttrs` for the top part and **fresh attrs** for the bottom part.
2. **All-new blocks** (no original character: paste, undo of a delete, moved lines) keep the identity carried in their attrs **only if their `localId` is unique** in the whole doc; otherwise they get `fresh(styleOf: source)` = new uuid, `blockId: null`, `kind: paragraph`, same depth (ED L92-103, L571-581).
3. **Duplicates:** if two blocks claim the same `localId` or `blockId`, the earliest in document order keeps it; later ones become fresh (ED L562-570).
4. **Kind fix-ups** (ED L585-596): a token kind whose chip is gone → fresh; token kind without chip → paragraph; image kind without the image atom → fresh; divider with content → paragraph.
5. **Empty last paragraph** keeps its identity unless text was purely appended to it, in which case the text takes the identity and a new empty tail is created (ED L538-546, 603-607). ProseMirror always has a last block, so model the Mac's `trailing` identity as the last block's attrs.

Per-operation outcomes that the tests check (EditorDocumentTests, WYSIWYGTests):
| Operation | Result |
|---|---|
| Enter mid-line | top keeps id; bottom new (`[a, null, b]`) |
| Enter at offset 0 of a non-empty block | new empty block **above**, the text keeps its id (`[null, a]`) |
| Backspace at line start (merge) | first block's id and kind win; the second id disappears (→ delete op) |
| Multi-line paste | first line joins the current block; later lines get new unique `localId`s |
| Kind change / indent | attrs only, id kept; the planner decides whether Notion recreates |
| Move / drag | same attrs in new order; ids kept; the planner recreates moved blocks |
| Undo of a delete | carried identity is unique → comes back with its old `blockId`; if that id is no longer in `previous`, it is inserted and re-stamped |
| Select all + type | one paragraph keeps the first id |

Confirmed ids are stamped with a transaction that sets attrs only and has `addToHistory: false` (ED L426-432, attribute-only so caret and undo are untouched). `clearBlockId` likewise. Loading from the server rebuilds the whole doc with fresh `localId`s, depth from the parent chain capped at 3, preserves the caret by `blockId + offset` (ED L743-766), and **clears undo history** (ED L167-171; recreate the `EditorState` with the same plugins).

#### 3.c.4 Snapshot (ED L236-247, L317-333)
`snapshot(doc): DocParagraph[]` in order, including the empty last paragraph. Per block: token → `kind token`, no spans; code → one plain span with hard breaks as `\n`; divider → no spans; others → spans from marks (U+FFFC stripped, hard break → `\n`), then `SpanRuns.normalize` (merge equal-format neighbors, drop empty) and `content = SpanRuns.key(kind, spans)` (code: joined text; divider/token/image: `""`; else `MarkdownSerializer.markdown(spans)`) (EI L9-34).

#### 3.c.5 Planner (ESP) — port line by line
Input `previous: SyncedParagraph[]` (pre-order, last server-confirmed; fields `blockId, parentId?, kind, content, spans, hasHiddenChildren`), `current: DocParagraph[]`. Output ops:
- `update(blockId, kind, content)` · `insert(parent: page | block(id) | pending(localId), position: start | after(blockId) | afterPending(localId), paragraphs[])` with **at most `maxBlocksPerAppend = 100`** per op (ESP L100) · `delete(blockId)` · `restoreToken(synced, depth, afterBlockId?)` (local only).
Steps (ESP L107-261):
1. **Structural parent:** nearest previous paragraph with smaller depth (depth stack); if it cannot have children, walk up to its parent.
2. **Retention**, in document order, for blocks whose `blockId` is in `previous` and unused: tokens only if both are tokens; others if (same `apiType` AND parent matches) OR `prev.hasHiddenChildren`. Parent matches = both top level, or the current parent's retained id equals the server `parentId`. So apiType change → recreate; same apiType (checked, code language, callout icon) → update; depth/parent change → recreate.
3. **Order:** group retained, placed, non-token blocks by parent (`"#page"` for top level); keep the **heaviest strictly increasing subsequence** of server positions (O(n²)); weight `1_000_000` if `hasHiddenChildren` or image, else `1000 + min(subtreeSize, 999)`; the rest lose retention (ESP L149-176, L267-281). (`longestIncreasingSubsequence` L284-301 is unused; do not port.)
4. **Cascade:** a retained child whose parent is not retained is recreated; with hidden children it stays retained but `placed = false`.
5. **Token restores:** every previous token not retained → `restoreToken` anchored after the last earlier surviving or restored block; depth from the previous parent chain.
6. **Updates and inserts in document order:** retained non-token non-image → `update` if kind or content changed (kind = current if apiTypes match else `prev.kind`); images are never updated; unretained tokens are skipped; everything else is inserted under `page` / `block(retainedId)` / `pending(parentLocalId)`, positioned after the last placed or inserted sibling under the same parent key (`after` / `afterPending`) else `start`; greedily batch following unretained, non-token paragraphs with the same parent key while the batch has < 100.
7. **Deletes:** previous non-token blocks not retained, only the top-most of a deleted subtree; never delete an ancestor of a token or a block whose parent is a token ancestor.
Emitted order: restores, then updates/inserts interleaved in document order, then deletes.

#### 3.c.6 Engine (PEE) — lifecycle, executor and refresh
| Config | Value | Source |
|---|---|---|
| debounce | **0.7 s** | PEE L81-104 |
| poll interval | **45 s** | |
| remote quiet period | **5 s** since the last local edit | |
| retry interval after a transient failure | **15 s** | |
| max passes per `syncNow` | **5** (while `syncAgain` is set; stop on the first failure) | PEE L289-312 |
| flush on quit | wait up to **3 s** for `syncNow` (Mac spins the run loop, PVM L90-101) | Windows: on `CloseRequested`/`ExitRequested`, hold exit with `api.prevent_exit()` up to 3 s |
| restored-token hint | shown **4 s**: "Restored a block that can't be deleted here. Use Notion." (Mac text has an em dash; adapted) | PEE L328-342, L570-580 |
| children fetch depth | expand children only for kinds that can have children and while depth < 3; `hasHiddenChildren = hasChildren && !expand && !isToken` | PEE L155-177 |

Status strings: "Saved", "Saving…", "Offline, will retry" (Mac: "Offline — will retry"; the em dash is removed per the brand rule), error = the message.

Load (PEE L115-145): idempotent, concurrent calls share one task, later calls refresh. Paint from cache `<pinId>-editor-doc.json` first, then fetch (recursive `blockChildren`, pre-order; a partial fetch never becomes `previous`), set `previous`, load the doc, save the cache, set `hasLoaded`, fetch page meta (cover). The editor is **read-only until `hasLoaded`**.

Local edits: every doc change (including attribute-only changes and undo/redo) → status saving + restart the 0.7 s debounce → `syncNow`. `flush()` cancels the debounce and syncs immediately; called when the page view unmounts (panel collapse or switching pin) and before quit.

`runPass` (PEE L323-504):
1. Snapshot + plan. If restores exist: apply them to the doc, show the hint, cancel the debounce, re-snapshot and re-plan.
2. `spansByBlock` from the snapshot: updates send the actual spans, not the Markdown key.
3. **Mass-delete guard:** if `deletes >= 3` AND `deletes * 2 > count(previous non-token blocks)` AND not confirmed → `pendingMassDelete = deletes`, status error "Not saved: this would delete N blocks.", pass fails. Footer button "Delete N blocks in Notion" → `confirmMassDelete()` sets the flag and runs `syncNow`. The flag resets after any pass that gets past the check. (`deletes` counts delete **ops**, top-most only; keep it, see 9.)
4. Execute ops **sequentially**:
   - **update** → `queue_submit({kind:"updateBlock", blockId, type: kind.apiType, update: blockUpdate(...)}, retainOnTransientFailure: false)`. `saved` → confirm; `queued` → stop the pass (transient); `failed` and *gone* (message equals the notFound message or contains "archived") → confirm delete, `clearBlockId`, `syncAgain` (re-insert next pass); other `failed` → collect error.
   - **insert** → resolve parent and anchor (pending local ids via `localToBlock`, else `blockIdForLocal`); unresolved → skip and mark these localIds failed (dependents cascade). Call `notion_append_blocks` **directly, not through the queue** (the engine needs the returned ids). Require `results.length >= paragraphs.length`; stamp each id onto its paragraph (`setBlockId`); if the paragraph is gone, log it (it is deleted next pass). For images the confirmed kind is the server's (hosted file URL). `confirmInsert` places blocks in `previous` after the anchor's whole subtree or at the parent's start (PEE L537-559). Transient error → stop; other → mark failed.
   - **delete** → through the queue; *gone* counts as success; `confirmDelete` also removes pre-order descendants from `previous`.
5. Save the cache. Transient failure → status offline, retry after 15 s. Errors → `"Not saved: <first>"`. Success with unchanged generation → mark synced, then re-plan as a self-check; a non-empty plan logs an error and sets `syncAgain` (PEE L494-502). `previous` changes **only** on confirmed results.

Payloads: `blockUpdate` (PEE L619-629): callout → `calloutContent` with the emoji only when the kind changed and the icon is non-empty (a non-emoji icon is never overwritten); to-do → `content(checked)`; code → `content(language: sendableLanguage)`; else `content`. `newBlock` (PEE L631-653): paragraph and token → formatted paragraph; callout → emoji or 💡; code → sendable language; divider → `{}`; image `upload:` → `imageUpload(id)`, `external:`/`file:` → `imageExternal(url)` (file images are re-downloaded and re-uploaded first, PEEI L43-65). Position JSON: start → `{"type":"start"}`, after → `{"type":"after_block","after_block":{"id"}}`, end → omitted.

Remote refresh (PEE L196-251): poll every 45 s while the page is open; apply only when not syncing, no pending debounce and ≥ 5 s since the last local edit; after the fetch check again (unchanged `editGeneration`); if the local plan has non-restore ops, schedule a sync and skip; apply only if `comparable(fetched) != comparable(previous)` where `comparable` strips the query string from `file:` image URLs (Notion re-signs them, PEEI L69-78). Applying = `load(preserveSelection: true)`, which clears undo (same as the Mac).

#### 3.c.7 Input rules, keymap and commands (EI, EC, ECB, ETV)
**Block shortcuts** (EC L101-114, EI L53-82), at a paragraph start, typed text ≤ 6 chars from the start to the caret, only when the current kind is paragraph (exception: a to-do shortcut on a bulleted line), not during IME composition, not with a selection:
| Typed | Kind |
|---|---|
| `# ` `## ` `### ` | heading 1 / 2 / 3 |
| `- ` `* ` | bulleted |
| `[] ` `[ ] ` `- [ ] ` | to-do unchecked |
| `[x] ` `[X] ` `- [x] ` | to-do checked |
| `> ` | quote |
| `+ ` | toggle |
| `!> ` | callout 💡 |
| ```` ``` ```` (no space) | code "plain text" |
| digits + `. ` (total length 3-5) | numbered |

**Inline rules** (EI L100-148), triggered by typing `*` `_` `~` `` ` `` `)`: `**b**` bold, `~~s~~` strike, `` `c` `` code, `*i*` / `_i_` italic (longest marker first), `[label](url)` via `\[([^\]\n]+)\]\(([^)\s]+)\)$` (URL needs a scheme or a `.`; no scheme → prefix `https://`). Inner text non-empty, no leading/trailing space; a single `*` is not half of `**`; opening `_` not after an alphanumeric; never inside inline code, code blocks or non-text kinds. After conversion, clear stored marks so typing continues unformatted.
**Undo restores the literal text:** each conversion is its own history step ("Format"); implement with TipTap `InputRule`s plus `undoInputRule` bound first in the Backspace and Mod-z chain, so Ctrl+Z right after a conversion restores `# ` etc. as typed (WYSIWYGTests `convert`).

**Keymap** (Mac ⌘ → Windows Ctrl, ⌥ → Alt):
| Key | Behavior (source) |
|---|---|
| Enter | EC L164-244: token → plain newline; image → new paragraph below; selection deleted first; code: inserts a hard break, but at the end when the text already ends with a hard break, replace it and exit to a new paragraph; divider → paragraph below; text exactly `---` with caret at end → divider + paragraph below; **empty** bulleted/numbered/to-do/quote/toggle/callout → becomes paragraph; end of an open toggle → child paragraph at depth+1; caret at 0 of a non-empty block → empty block above with the continuation kind; otherwise split, new line uses the continuation kind at the same depth (to-do → unchecked to-do; bulleted, numbered, quote, toggle → same; else paragraph) |
| Shift+Enter | hard break (soft line break, Mac default `insertLineBreak` → U+2028) |
| Backspace | EC L266-302: image under caret or selected → delete with its line break; at content start with no selection: token → default; non-paragraph → becomes paragraph; depth > 0 → outdent; previous is divider → delete divider; previous is token → swallow; previous is image → select it; else merge |
| Delete | removes an image under the caret; at a line end before an image, selects it (ECB L34-45) |
| Tab / Shift+Tab | indent/outdent every block in the selection, one step; indent only if depth < 3 and depth ≤ previous depth; outdent if > 0; in code, insert a tab (EC L308-335) |
| Alt+Shift+↑ / ↓ | move block with children (ECB L139-158); `moveBlockUp` = before the nearest previous block with depth ≤ own; down = after the next block's subtree |
| Ctrl+B / Ctrl+I / Ctrl+E / Ctrl+Shift+X | bold / italic / inline code / strike (Mac ⌘B ⌘I ⌘E ⌘⇧X); with a selection: remove if all runs have it, else add (EC L359-401). No underline shortcut |
| Ctrl+K | link popover (needs a selection); empty input removes the link; missing scheme → `https://` |
| Ctrl+F / F3 or Ctrl+G / Shift+F3 or Ctrl+Shift+G | find bar show / next / previous (adapted: F3 added, Windows convention) |
| Esc | close slash menu, then find bar, then collapse the panel |
| Ctrl+click | open link (browser) |
| Ctrl+Z / Ctrl+Y and Ctrl+Shift+Z | undo / redo |

**Paste** (EC L407-442): parse with `MarkdownImport.blocks` (EI L188-222: CRLF/CR → LF; leading tab or 2 spaces = one depth level, cap 3; fenced code with language; each other line via `ParagraphSyntax.parse` PS L144-179). First block's content goes into the current block (its kind/depth only if the target is an empty paragraph); later blocks become new blocks at `min(baseDepth + depth, 3)`; one history step; pasted text does not inherit stored marks. Images on the clipboard → image upload (3.c.9). **Copy/cut** write Markdown as plain text (EI L224-243: 2 spaces per depth; numbered items use their display number; tokens → title; images → `![image](url)`).
**Slash command apply** (EC L470-495): remove `/query` and set the kind in one step; divider on an empty line → divider + paragraph; on a non-empty line → keep text, insert divider below and a paragraph below that.
**moveBlock(at, before, depth)** (ECB L88-135): reject drops into itself or no-ops; root gets the new depth, each child `max(min(newDepth+1, 3), min(oldChildDepth + delta, 3))`; `maxDepth(forMoveOf, before) = min(depth of the block above the drop + 1, 3)`.

#### 3.c.8 Slash menu, toggles, callouts, find, gutter, placeholders, drag handle
- **Slash commands** (SC L5-80), in order: Text (paragraph, plain), Heading 1 (h1, title), Heading 2 (h2, subtitle), Heading 3 (h3), To-do (todo, task, checkbox), Bulleted list (bullet, ul, list), Numbered list (number, ol, list), Quote (blockquote), Code (codeblock, snippet; keeps the language if already code), Divider (hr, line, separator), Toggle (collapse, details, disclosure), Callout (note, info, tip; keeps the icon if already a callout, else 💡). Scoring (lowercased, trimmed; empty → all): 0 title or compact title (no spaces/dashes) starts with the query; 1 a title word starts with it; 2 a keyword starts with it; 3 first letter matches and query is a subsequence of the compact title; else excluded; ties keep order. Open when `/` is typed in a text-kind, non-code block and the text before is whitespace or ends with a space. Close when the caret leaves the block or moves before the anchor, there is a selection, the `/` is deleted, or there are no matches and the query ends with a space or is longer than 12 chars. "No results" when empty. ↑/↓ wrap, Enter or Tab apply, Esc closes, hover highlights, click applies. Menu 220 px wide, 28 px rows + 8, below the slash, flipped above if it would overflow (SLM L28-174). Icons: Lucide equivalents.
- **Toggles:** children = following blocks with greater depth; collapse is local (`collapsed` attr keyed by block, never synced, does not bump `editGeneration`); hidden blocks get a `display:none` node decoration (Mac: null glyphs, MEV L140-172); arrow ▸ collapsed / ▾ open at x+7, 13 px, `--text-2`; click toggles.
- **Callouts:** background `#1C1C1E`, radius 6, icon at x+5, 14 px; continuation after Enter is a paragraph.
- **Find** (FindBar.swift): case- and diacritic-insensitive (`localeCompare` with `sensitivity: "base"` or NFD-strip both sides), non-overlapping; decorations only (no doc change): current match accent @ 0.85, others @ 0.3; counter "i of n" ("0 of 0"); Enter next, Shift+Enter previous, Esc or ✕ closes; Ctrl+F prefills from a selection shorter than 200 chars; re-runs on every doc change keeping the position.
- **Gutter markers** (widget decorations in the left inset, never text; `x = depth * 24`): bulleted glyph by `depth % 3` "•", "◦", "▪︎" (15 px, 10 px for ▪︎) at x+8; numbered "N." tabular 14 px right-aligned to contentX−6 using `ListNumbering` (EI L162-177: consecutive numbered at the same depth count up, deeper items don't break the run, any other block at that depth or shallower restarts); to-do 16 px checkbox at x+3 (unchecked border white @ 0.45, 1.5 px, radius 4; checked accent fill + white check; 0.18 s scale 0.7 → 1); checked text `#808080` + strikethrough; click toggles and plays the tick when checking; quote bar 3 px at x+2, white @ 0.75; code background `#1C1C1E` radius 6 extended 4 px above and below; divider 1 px white @ 0.18 centered.
- **Indent and spacing** (STY): indent per level 24; gutter width bulleted/numbered/to-do/toggle/callout 26, quote 16, code 12, else 0; `contentX = depth*24 + gutter`. Fonts: H1 24 semibold, H2 19 semibold, H3 16 semibold, code mono 13, else 14. Spacing before: H1 14, H2 10, H3 6, code 6, callout 4, divider 2; paragraph spacing default 4 (code 10, callout 8); line spacing 4 (code 2); right inset 12 for code and callout. Inline code mono size−1 on `#1C1C1E`, color `#FF7B72`; links accent + underline; selection white @ 0.25; caret white. Text container inset 30 px horizontal (handle gutter), 12 px vertical.
- **Placeholders** (only on the caret's empty block when focused, no selection, white @ 0.32): paragraph "Type '/' for commands", "Heading 1/2/3", "To-do", "List" (bulleted, numbered), "Quote", "Toggle", "Callout", "Code".
- **Token chips:** white @ 0.08, radius 6, 13 px medium, padding 10 × 5; icons child_database "▦", child_page "📄", other "▪︎"; click opens `notion://www.notion.so/<id without dashes>` if the protocol is registered, else `https://www.notion.so/<id>`. Titles: "Untitled database", "Untitled page", or the type with `_` → space.
- **Drag handle** (ETV+DragHandle/BlockDrag): 14×20 at gutterX−18, centered on the first line, 2×3 dots of 2.5 px, alpha 0.35 hover / 0.7 dragging, only when editable, `grab` cursor. Drag starts after 3 px; target = first visible block whose vertical midpoint is below the pointer; depth = `sourceDepth + round(dx / 24)` clamped to `maxDepth`; indicator 2 px accent line at that depth's x with a 6 px dot; drop calls `moveBlock`; a plain click selects the block's content. Use pointer events in a plugin view, not HTML5 drag and drop (WebView2 drag image flicker in a transparent window).

#### 3.c.9 Images, cover
- Paste/drop (ETV+Images L59-103): file paths of image types first, then PNG, JPEG, TIFF data. Pass through png, jpg, jpeg, gif, webp, heic; convert others to PNG (canvas `toBlob`). Names "Pasted image.png" / "Pasted image.jpg". Several images are inserted in reverse order after the same block so they keep their order. Drop location from `view.posAtCoords`. Dropped files arrive via Tauri's `onDragDropEvent` (paths) because WebView2 file drops are intercepted when `dragDropEnabled` is true; read them in Rust.
- `insertImage` (PEEI L11-33): requires `hasLoaded`; > 20 MB → "Image is too large (X); the limit is 20 MB."; insert an `UploadingChip` (token `image_upload`, "Uploading image…", spinner, 26 px) after the block; call `upload_image`; on success replace the chip with an image block `upload:<id>` (the next sync appends it); on failure remove the chip and show "Image not uploaded: …"; if the chip was undone, drop the result.
- Image node view: width up to the column, height ≤ 240; loading 90 px high, ≤ 320 wide, "Loading image…"; failed 36 px "Image unavailable"; radius 6; 2 px accent ring when selected. Expired `file:` URLs: on load error call `notion_retrieve_block` for a fresh URL (PEEI L36-39).
- Cover strip (CoverStrip.swift): when `GET /pages/{id}` has a cover; 56 px high, `object-fit: cover`, gradient black 0 → 0.85 over the bottom 55%, fallback `#1C1C1E`, no pointer events. Bytes come from Rust `cover_get` (cache key: URL without query and fragment, FNV-1a 64 over UTF-8 bytes, offset `0xcbf29ce484222325`, prime `0x100000001b3`, lowercase hex; a 403 means expired → refresh page meta once and retry; no eviction) (CoverCache.swift L15-68).

#### 3.c.10 Why TipTap and not BlockNote (summary for DECISIONS.md)
TipTap: custom flat schema with exactly Brink's attrs; full control of `appendTransaction` for identity, input rules with undo, decorations for gutter/find/placeholder/collapse, node views for tokens and images; MIT; ~60 KB. BlockNote: nested block tree with its own ids, own slash menu and side menu, opinionated UI and styling, and a block model that does not map 1:1 to "paragraph + depth"; the identity rules would have to be reimplemented on top of its ids anyway. The planner and engine are editor-agnostic (they consume `DocParagraph[]`), so swapping editors later only touches `editor/`.

### 3.d The Notion client (Rust)

Lives in `windows/src-tauri/src/notion/`. Port of `Sources/NotionKit/Notion/NotionClient.swift`, `RateLimiter.swift`, `NotionError.swift`, `FileUpload.swift`, `NotionClient+Icons.swift`. Uses `reqwest` (rustls, `json`, `multipart` features) and `tokio`.

#### 3.d.1 Transport (NotionClient.swift)
| Item | Value | Source |
|---|---|---|
| Base URL | `https://api.notion.com/v1` | NotionClient.swift:16 |
| `Notion-Version` header | `2025-09-03` (`NotionClient.apiVersion`) | NotionClient.swift:9 |
| Auth header | `Authorization: Bearer <token>` | :183 |
| Content-Type | `application/json` (multipart for file send) | :185-189 |
| No token | fail with `missingToken` before any I/O | :175 |
| Rate limiter | one shared limiter, **min spacing 0.34 s** between request *starts* (≈2.94 req/s, under Notion's 3 req/s average) | NotionClient.swift:17, RateLimiter.swift |
| Limiter algorithm | `start = max(now, nextAvailable)`; `nextAvailable = start + 0.34 s`; sleep until `start`. `delay(until)` pushes `nextAvailable` to at least that instant. Acquire happens **after** building the request and **before** sending, on every attempt including retries. | RateLimiter.swift:13-25 |
| 429 | retry while `attempt < 3` (so up to 3 retries, 4 sends). Wait = `Retry-After` header parsed as seconds (Double), default **1 s**; call `limiter.delay(until: now + wait)` and also sleep `wait`. After the 3rd retry fails → `rateLimited`. | :208-213 |
| 5xx | retry once (`attempt < 1`) after **0.5 s**; then map the body to `api(code, message)`. The attempt counter is shared with 429 retries (a 429 followed by a 5xx gets no 5xx retry). Keep that quirk for parity. | :214-217 |
| 401 | if an `onUnauthorized(rejectedToken)` hook exists and this request has not refreshed yet, await it; if it returns true, resend once with `didRefresh = true` (OAuth refresh). Otherwise `unauthorized`. | :218-222 |
| 404 | `notFound` | :223 |
| Other non-2xx | decode `{code, message}` → `api(code ?? "<status>", message ?? "Unknown error")`; undecodable → `api("<status>", "HTTP <status>")` | :230-236 |
| Transport error | `network(<description>)` | :198-203 |
| Decode error | `decoding(<detail>)` | :168 |
| Timeouts | none set (URLSession default 60 s request timeout). Use `reqwest` timeout 60 s. | |

Error enum (NotionError.swift) with exact user-facing messages (keep them, they show in the UI):
| Case | Message | `isTransient` |
|---|---|---|
| `unauthorized` | The Notion token is invalid or expired. | true |
| `notFound` | That Notion item was not found. | false |
| `notShared` | This page or database isn't shared with the integration. | false |
| `rateLimited` | Notion is rate limiting requests. Try again shortly. | true |
| `api(code,message)` | Notion API error (\<code\>): \<message\> | false |
| `decoding(detail)` | Failed to decode Notion response: \<detail\> | false |
| `network(detail)` | Network error: \<detail\> | true |
| `missingToken` | No Notion token is configured. | true |

Serialize to the frontend as `{ kind: "unauthorized" | …, code?, message, transient }` (serde `tag = "kind"`).

#### 3.d.2 Endpoints used
| Method + path | Body / query | Used for | Swift |
|---|---|---|---|
| `POST /search` | `{ query?, start_cursor? }` (query omitted when empty) | Add-pin search | `search(query:)` |
| `GET /databases/{id}` | | Resolve a database to its `data_sources[] {id,name}` | `retrieveDatabase` |
| `GET /data_sources/{id}` | | Schema (properties, title property) | `retrieveDataSource` |
| `POST /data_sources/{id}/query` | `{ filter?, sorts?, start_cursor? }` | Task rows | `queryDataSource` |
| `POST /pages` | `{ parent: { type: "data_source_id", data_source_id }, properties: { <titleProp>: { title: [richText] }, …extra } }` (fetches the schema first to find the `title`-type property; none → `decoding("Data source … has no title property")`) | Quick add / capture | `createRow` |
| `PATCH /pages/{id}` | `{ properties: {…} }` | Tick, date, snooze, any property update | `updatePageProperties` |
| `PATCH /pages/{id}` | `{ icon: { type: "emoji", emoji } }` | "Also set as page icon in Notion" | `setPageEmojiIcon` (NotionClient+Icons.swift) |
| `GET /pages/{id}` | | Cover + icon (`PageMeta`) | `retrievePage` |
| `GET /blocks/{id}/children` | `?start_cursor=` | Page blocks (recursively per parent where the engine asks) | `blockChildren` |
| `GET /blocks/{id}` | | Fresh signed image URL | `retrieveBlock` (FileUpload.swift) |
| `PATCH /blocks/{id}` | `{ type, <type>: { rich_text, checked?, language?, icon? } }` per `BlockUpdate` case: `text`, `checked`, `richText`, `content(spans, checked?, language?)`, `calloutContent(spans, emoji?)` (icon only when emoji non-empty) | Edit a line | `updateBlock` |
| `PATCH /blocks/{id}/children` | `{ children: [NewBlock…], position? }` (API 2025-09-03 `position` param, `after` is deprecated) | Insert lines | `appendBlocks` |
| `DELETE /blocks/{id}` | | Delete (to Notion trash) | `deleteBlock` |
| `POST /file_uploads` | `{ mode: "single_part", filename, content_type }` | Image upload step 1 | `createFileUpload` |
| `POST /file_uploads/{id}/send` | multipart, field `file` | Image upload step 2 | `sendFileUpload` |
| OAuth (dormant): broker `POST /token`, `POST /refresh` | see 3.e | | NotionOAuth.swift, OAuthBroker.swift |

Pagination (`paginate`, NotionClient.swift:148-157): loop while `has_more`, passing `next_cursor` as `start_cursor`; **no `page_size` is sent** (Notion default 100). Collect all `results`.

#### 3.d.3 File upload flow (FileUpload.swift)
1. Reject if `bytes > 20 * 1024 * 1024` (`singlePartUploadLimit`) with `tooLarge` → message "Image is too large (\<size\>); the limit is 20 MB."
2. `POST /file_uploads` `{mode:"single_part", filename, content_type}` → `{id, status, filename, content_type, upload_url}`.
3. `POST /file_uploads/{id}/send` multipart/form-data, boundary `NotionDock-<uuid>` (keep the prefix), one part `name="file"; filename="<escaped>"` with `Content-Type: <type>`; escape `"` → `%22`, strip CR/LF in names.
4. Require `status == "uploaded"`, else `notUploaded(status)` → "Image upload didn't complete (status: \<status\>)."
5. Attach within 1 hour as an image block `{ type: "image", image: { type: "file_upload", file_upload: { id } } }` through `appendBlocks`.
The upload goes through the same rate limiter and retry rules (`performRequest` with `rawBody`).

#### 3.d.4 Rust module layout and Tauri commands
```
src-tauri/src/notion/
  mod.rs            // pub use
  client.rs         // NotionClient: request(), perform_request(), paginate()
  rate_limiter.rs   // RateLimiter (tokio::Mutex<Instant>), unit-tested with tokio::time::pause()
  error.rs          // NotionError + messages + is_transient + serde
  endpoints.rs      // search, databases, data_sources, pages, blocks, file_uploads
  upload.rs         // multipart body builder (port MultipartFormData)
src-tauri/src/commands/notion_cmds.rs  // #[tauri::command] wrappers
```
Commands take and return `serde_json::Value` for Notion payloads (the TS side owns the typed models: `Block`, `Row`, `RichText`, `PropertyValue`, ported from NotionKit). This keeps Rust thin and the domain logic testable in Vitest. Commands: `notion_search(query)`, `notion_retrieve_database(id)`, `notion_retrieve_data_source(id)`, `notion_query_data_source(id, filter, sorts)`, `notion_create_row(dataSourceId, title, extra)`, `notion_update_page_properties(pageId, properties)`, `notion_set_page_emoji_icon(pageId, emoji)`, `notion_retrieve_page(id)`, `notion_block_children(id)`, `notion_retrieve_block(id)`, `notion_update_block(id, payload)`, `notion_append_blocks(parentId, children, position)`, `notion_delete_block(id)`, `notion_upload_file(path | bytes, filename, contentType) -> id`.

**Why Rust here:** one process-wide rate limiter shared by every window (notch, capture, tray) is only possible in the core process; the token never enters the WebView; multipart and file reads are simpler; reqwest is not subject to WebView CORS. **Why TS for the rest:** the editor planner, parsers and view models are pure logic the user (a React/TS dev) will maintain, and their Swift tests port 1:1 to Vitest.

The demo/fake server is selected by a base-URL override (`NOTION_BASE_URL` env in tests, the in-process demo server URL in demo mode), mirroring how the Swift tests inject `MockURLProtocol` and `FakeNotionServer`.

### 3.e Credentials: Windows Credential Manager

Port `Sources/NotionKit/Notion/Keychain.swift` (`TokenStore` + `SecretBackend`) to `src-tauri/src/secrets.rs` with the `keyring` crate (v3, feature `windows-native`), which stores **Generic credentials** in Credential Manager.
| Mac Keychain account (service `cz.stepanblaha.notiondock`) | Windows keyring entry (service, user) | Content |
|---|---|---|
| `notion-token` | (`cz.stepanblaha.brink`, `notion-token`) | access token, both auth kinds |
| `notion-refresh-token` | (`cz.stepanblaha.brink`, `notion-refresh-token`) | OAuth refresh token (dormant) |
| `notion-oauth-meta` | (`cz.stepanblaha.brink`, `notion-oauth-meta`) | JSON `OAuthWorkspace {workspaceId?, workspaceName?, workspaceIcon?, botId?}` |

The keyring crate's Windows target name is `<user>.<service>`; it shows in Control Panel → Credential Manager → Windows Credentials as `notion-token.cz.stepanblaha.brink`. Document this in the privacy policy (7.6).

Semantics to keep exactly (Keychain.swift:53-97):
- `save(token)` (paste flow) writes the access token and **removes** refresh + meta.
- `save_oauth(access, refresh?, workspace)` writes access, writes or removes refresh (empty counts as absent), writes meta.
- `kind()`: none if no access token; `oauth` if meta exists; else `internal`.
- `delete()` removes all three (Settings → Disconnect).
- Tests use an in-memory backend (`InMemorySecretBackend`): define a `SecretBackend` trait with `KeyringBackend` and `MemoryBackend`.
- Credential blobs are limited to 2560 bytes by Windows; Notion tokens are far below that, but assert `< 2048` and fail with a clear error.
- The token is read in Rust only. The frontend gets `auth_status() -> { kind: "internal" | "oauth" | null, workspace? }`, never the token.
- Demo mode uses the memory backend with a fake token.

OAuth ("Connect to Notion") stays **dormant**, exactly as on the Mac: the button appears only once `OAuthConfig` has a client id and broker URL; the token-paste flow is the default. If enabled later, the flow is: open the Notion authorize URL in the default browser, the broker's `/callback` 302s to `brink://oauth/callback?code&state`, Windows delivers it through the registered `brink` protocol (single-instance plugin forwards the argv to the running app), the app checks `state` and POSTs `{code, redirect_uri}` to the broker `/token`.

### 3.f Notifications with actions (reminders)

Port of `ND/Services/ReminderService.swift` + `NK/Store/ReminderPlanner.swift`. Planning stays in TS (`domain/store/reminderPlanner.ts`, pure); delivery is Rust (`src-tauri/src/notify.rs`).

**Planner (parity, ReminderPlanner.swift):** `maxPending = 64` (keep the cap even though Windows has no 64 limit: same behavior, same tests); identifiers `brink.reminder.item.<pinId>.<itemId>`, `brink.reminder.summary.YYYY-MM-DD`, snoozes `brink.snooze.<itemId>`; date-only items fire at `reminderHour:00` (default 9), timed at their time; fire times ≤ now skipped; title = item title; body `"<pin title> · Due at <short time>"` or `"<pin title> · Due today"` (U+00B7); morning summary for day offsets 0, 1, 2 (`summaryDaysAhead = 3`) at `morningSummaryMinutes`, title "Brink", body "1 task due today" / "N tasks due today" + " · M overdue", or "M overdue"; skipped when nothing due or overdue; sort by fire date then identifier; cut to the limit.
**Service rules (ReminderService.swift):** only when `remindersEnabled` and not demo mode; debounce 1.5 s at start, 0.3 s on settings changes, 1.0 s on summary changes; pins whose summary is not loaded keep their existing scheduled toasts; stale snoozes (item done or gone) are removed; only changed requests are re-added; payload `{pinId, itemId}` (summary pinId falls back to `brink.today`).

**Delivery on Windows:**
- Use the `windows` crate (`UI_Notifications`, `Data_Xml_Dom`) directly, not `tauri-plugin-notification` (it cannot schedule or add actions on Windows). Schedule with `ScheduledToastNotification(xml, DateTime)` + `ToastNotifier::AddToSchedule`, list with `GetScheduledToastNotifications`, remove with `RemoveFromSchedule`; set `Id` (≤ 64 chars on Windows: hash long identifiers with FNV-1a and keep a map in memory) and `Tag`/`Group` (`Group` = pinId, like `threadIdentifier`).
- Toast XML (item):
```xml
<toast launch="action=open&amp;pinId={pinId}&amp;itemId={itemId}" activationType="foreground">
  <visual><binding template="ToastGeneric"><text>{title}</text><text>{body}</text></binding></visual>
  <actions>
    <action content="Mark done"     arguments="action=done&amp;pinId={pinId}&amp;itemId={itemId}" activationType="background"/>
    <action content="Snooze 1 hour" arguments="action=snooze&amp;pinId={pinId}&amp;itemId={itemId}" activationType="background"/>
    <action content="Open"          arguments="action=open&amp;pinId={pinId}&amp;itemId={itemId}" activationType="foreground"/>
  </actions>
  <audio src="ms-winsoundevent:Notification.Default"/>
</toast>
```
  Summary toasts have only "Open" (category `brink.summary`).
- **AUMID:** unpackaged apps need a Start-menu shortcut with `System.AppUserModel.ID = cz.stepanblaha.brink` (the NSIS installer creates it; set it in `tauri.conf.json > bundle.windows.nsis` template or via `SetCurrentProcessExplicitAppUserModelID` at startup plus the shortcut). In dev, register a temporary AUMID under `HKCU\Software\Classes\AppUserModelId\cz.stepanblaha.brink` (DisplayName "Brink", IconUri).
- **Activation:** while Brink runs, handle `ToastNotification.Activated` (`ToastActivatedEventArgs.Arguments`). When Brink is not running, a click relaunches the exe with the arguments: unpackaged apps get them on the command line only if the toast uses `activationType="protocol"`; therefore use `launch="brink://notify?action=…"` with `activationType="protocol"` for Open, and background actions via the COM activator registered by `ToastNotificationManagerCompat`-equivalent (CLSID in the shortcut's `System.AppUserModel.ToastActivatorCLSID`). Simplest robust approach for v1: **all three actions use `activationType="protocol"` with `brink://notify?action=done|snooze|open&pinId=&itemId=`**, handled by the deep-link path (3.l); single-instance forwards it to the running app; Done/Snooze do not show any window. Record as adapted.
- Actions (ReminderService L179-201): `done` → tick sound, `ItemActions.markDone`, cancel any pending snooze for that item; `snooze` → schedule the same content as `brink.snooze.<itemId>` after **3600 s**; `open` → `notch://open-pin {pinId}`.
- Peek for reminders: the hub sets a timer for the next item's fire date; when it fires and `peekForReminders` is on, run the reminder peek (3.b.6).
- Permission: Windows has no prompt; check `ToastNotifier.Setting` (`Enabled`, `DisabledForApplication`, `DisabledForUser`, `DisabledByGroupPolicy`). If disabled, show "Notifications are turned off for Brink. Turn them on in Windows Settings, System, Notifications." and turn `remindersEnabled` off, like the Mac `permissionDenied` path.
- Focus Assist / Do not disturb suppresses banners but keeps them in the Action Center: acceptable, document it.

### 3.g Global hotkeys
`tauri-plugin-global-shortcut` (RegisterHotKey underneath; no admin, no hooks). Actions and defaults from `NK/Store/HotkeyCombo.swift` L40-67:
| Action | Title | Mac default | Windows default | Conflict notes |
|---|---|---|---|---|
| `toggleLastPin` | Toggle last-opened pin | ⌥Space | **Alt+Space** | Alt+Space opens the window system menu of the focused window. RegisterHotKey wins globally, so it works, but users lose the system menu. Keep it as the default for parity, and show the hint "Alt+Space also opens the window menu in Windows. Change it here if you use that." in Shortcuts. PowerToys Run also uses Alt+Space: registration fails then, see below. |
| `openPinN` | Open pin 1–9 of active group | ⌥1…⌥9 (only modifiers stored) | **Alt+1…Alt+9** | Alt+digit is free system-wide; some apps use it for tabs, acceptable (same trade-off as the Mac) |
| `quickCapture` | Quick capture | ⌥⇧Space | **Alt+Shift+Space** | free |
| `clipboardAppend` | Append clipboard | ⌥⌘V | **Ctrl+Alt+V** | Win+V is clipboard history (avoid Win combos); Ctrl+Alt+V is "paste special" in Office only when Office is focused, but RegisterHotKey takes it globally: document it |
- Never allow combos with the Win key (reserved by the shell; `RegisterHotKey` fails for most) and never allow a combo without at least one of Ctrl/Alt (the Mac recorder rejects combos without a modifier, ShortcutRecorder L53-65). Reject Ctrl+Alt+Delete, Alt+Tab, Alt+F4, Ctrl+Esc, Ctrl+Shift+Esc, Alt+Esc, PrintScreen combos.
- Registration failure (`HotKeyAlreadyRegistered` from another app): keep the binding, mark it "In use by another app" in Settings, and show a toast once: "Alt+Space is used by another app. Pick a different shortcut in Settings."
- Internal conflicts: port `HotkeyBindings.conflict` exactly (sets of occupied combos must be disjoint; openPinN occupies 9). Messages: `<combo> is already used by "<title>".` and `Default is in use by "<title>"; change that one first.`
- Recorder: click the field ("Press keys…"), press the combo; Esc cancels; while recording call `hotkeys_suspend(true)` so the old binding does not fire (HotkeyCenter L47-73). Display order Ctrl, Alt, Shift then key, joined with "+"; openPinN shows "Alt+1–9" (en dash is fine; only em dashes are banned).
- Storage: `settings.hotkeys[action] = "Alt+Space"` (Tauri accelerator syntax). Dispatch: `hotkey://fired {action, index}` → hub (`toggleLastPin`: last opened pin, else first real pin; `openPinN`: real pin at index of the active group, Today excluded; both toggle collapse if that pin is already expanded; `quickCapture` → `capture_show`; `clipboardAppend` → clipboard flow).
- Quick capture window keys (QuickCapturePanel): Enter saves and closes, **Ctrl+Enter** (Mac ⌘Enter) saves and keeps it open, Esc cancels.

### 3.h Tray flyout (menu-bar mini-list equivalent)
- Tray icon via Tauri `TrayIconBuilder` (white notch glyph; dark variant on light taskbars). Tooltip "Brink" or "Brink · N open" when `menuBarShowOpenCount` is on (`MiniList.statusTitle`: `" N"`, `" 99+"` above 99, empty when off or 0; Windows trims the leading space). Optionally an overlay count on the icon (draw into the 32 px icon at runtime).
- **Left click** with `menuBarListEnabled` → toggle the `tray` flyout window: 320×440 logical, borderless, topmost, `skipTaskbar`, positioned above the tray icon (`TrayIconEvent::Click` gives the icon rect; clamp to the work area of that monitor; if the taskbar is at the top, open below). Hide on blur (`WindowEvent::Focused(false)`), Esc, or a second click. Fade/scale in 0.94 → 1 with `contents`.
- **Right click** → native menu (AppDelegate L83-135): "Dock on Left", "Dock on Right", "Dock on Top", separator, "Resting pill: Show/Hide", separator, "About Brink", "Settings…", "Help", "Send Feedback", "Privacy Policy", "Terms of Use", separator, "Quit Brink".
- Flyout content (MiniListView/MiniListModel): top field (plus icon, placeholder `Add to <target title>…` or `Add a to-do…`, autofocus; Enter → quick add; the text also filters items case-insensitively); sections = pins of the active group (all pins if none or stale), sorted by order then title, header chevron + icon + title + open count, target section highlighted; expanding loads lazily (page: open unchecked top-level `to_do` blocks, cache first; database: open rows through `DatabaseModel`); empty states "Loading…", "Nothing open", "No pins yet.", "Connect Notion in Settings."; rows = checkbox + title (2 lines). Check: optimistic hide + tick; page → `updateBlock to_do checked=true`; database → `toggleDone`; failure unhides and shows the message. Quick add appends a temp item at the end, then page → `appendBlock(toDo)`, database → `quickAdd`, then reload. Footer: "Open in notch", error text, "Settings…".
- Target pin: last selected/expanded pin (`lastOpenedPinID`), else first section.

### 3.i Autostart
- Unpackaged (NSIS/MSI): `tauri-plugin-autostart` (`MacosLauncher` irrelevant; on Windows it writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\Brink = "<exe>" --autostart`). With `--autostart` Brink starts with only the notch and tray; onboarding opens only on a manual launch.
- MSIX: `windows.StartupTask` (`TaskId="BrinkStartup"`), toggled with `StartupTask.GetAsync("BrinkStartup").RequestEnableAsync()`; states map to the Mac copy: Enabled → "Enabled."; DisabledByUser → "Turned off in Windows Settings, Apps, Startup." + button "Open Startup settings" (`ms-settings:startupapps`); DisabledByPolicy → "Turned off by your organization."; else "Not enabled."
- Settings row: "Launch Brink at login" (Mac wording; on Windows "Launch Brink when you sign in").

### 3.j Sounds
`ND/Services/SoundService.swift`: one synthesized tick, no assets. Port to WebAudio in `src/services/sound.ts` (hub window only; other windows send `sound_tick` via an event to the hub):
- Mono, 44.1 kHz, **40 ms**, sine **1200 Hz**, amplitude **0.18**, envelope `min(1, t/0.002) * exp(-110 t)`, player volume **0.5**. Build it once as an `AudioBuffer` (do not depend on Rust).
- Throttle `TickThrottle(minInterval: 0.08 s)`: at most one tick per 80 ms (MiniList.swift L53-65).
- `tick()` respects `soundsEnabled` (default true); `play()` ignores it (Settings "Test" button). Play only when an item becomes checked (peek, editor checkbox, database view, Today, tray, notification Done).
- WebView2 autoplay: the hub window must call `audioContext.resume()` after the first user gesture; set the WebView2 flag `--autoplay-policy=no-user-gesture-required` via `additionalBrowserArgs` in `tauri.conf.json` so ticks from notification actions also play.

### 3.k Parity test catalog (port every case)
The Swift suites in `Tests/NotionKitTests/` (32 files, 190+ tests) are the spec. Port each suite to the listed file, keep the test names (camelCase → `it("…")` with the same name), same inputs, same expected outputs. Pin time with fake timers and `TZ=Europe/Prague`. Shared fixtures (`Fixtures/*.swift` JSON strings) become `windows/fixtures/*.json`.
| Swift suite (file) | Port to | Key cases (inputs → expected) |
|---|---|---|
| BrandingTests | `src/domain/version.test.ts` | `"0.9.0 (1)\n"` → 0.9.0/1; `"2.0.1"` → build "1"; `""`, `"abc (1)"`, `"1.0 (x)"`, `"1..0 (1)"` → null; repo `VERSION` equals `tauri.conf.json` version; no source contains "Notion Dock"; **Windows addition:** no U+2014 in UI strings |
| MiniListTests | `domain/store/miniList.test.ts` | sections sorted by order; unknown active group → all pins; `statusTitle` (7,on) " 7", (0,on) "", (7,off) "", (250,on) " 99+"; TickThrottle 0.08: t0 yes, +0.05 no, +0.09 yes, +0.10 no |
| RichTextTests | `domain/notion/richText.test.ts` + Rust `encode.rs` | 4500 chars → 2000/2000/500; "" → [""]; encode 2500 → 2 items |
| PropertyValueTests | `domain/notion/propertyValue.test.ts` + Rust | round trips of every case; `checkbox(true)` → `{"type":"checkbox","checkbox":true}`; `date(nil,nil)` → `{"type":"date","date":null}`; unsupported → no JSON |
| DecodingTests | `domain/notion/decoding.test.ts` | search: page "My Task List" 📝, data source "Tasks" external icon; schema 5 props sorted, status options ["Done","Not started"]; done inference (group "Complete" wins → ["Shipped"]); query pages + cursors; children: paragraph, toDo checked, heading1, unsupported("embed") |
| NotionClientTests | Rust `tests/client.rs` (wiremock) | 429 Retry-After 1 then 200 → ≥ 0.9 s; four 429 → rateLimited; 3 calls spaced ≥ 0.3 s; 401 → unauthorized; 404 → notFound; no token → missingToken before any request; **Windows addition:** `Notion-Version: 2025-09-03` header asserted |
| OAuthTests | `domain/auth/oauth.test.ts` + Rust secrets tests | authorize URL params; state ≥ 40 chars `[A-Za-z0-9_-]`; callback parsing (bad/missing/empty state → stateMismatch; access_denied; missing code; `brink://pin/…` not a callback; trailing slash ok); TokenStore kinds; refresh on 401 sequence (Bearer old → broker /refresh without auth → Bearer new); internal token: no refresh; invalid_grant → unauthorized, no loop |
| MarkdownParserTests | `domain/markdown/markdownParser.test.ts` | headings, `-`/`*`/`+` bullets (legacy parser), numbered, to-dos, quote, fenced code with/without language, divider, blank lines, inline spans incl. `***both***`, unmatched markers literal, `**bold \`code\` text**` |
| MarkdownSerializerTests | `markdownSerializer.test.ts` | annotations, `***x***`, prefixes, `- [x] **buy milk**`, round trips |
| ParagraphSyntaxTests | `paragraphSyntax.test.ts` | parameterized kinds table; depth `\t\t- x` → 2, four tabs → 3; code parsing; render/parse round trip at depth 1; `normalizeLanguage("JS")` = javascript, `sendableLanguage("klingon")` = plain text |
| EditorDocumentTests | `editor/identity.test.ts` (jsdom + real PM state) | empty lines round trip; enter mid-line `[a,null,b]`; enter at start `[null,a]`; type after enter keeps localId, `setBlockId` stamps; merge keeps a; paste 3 lines → 3 new; trailing empty line; nesting stores no prefixes; token chip delete + restore; typing after chip; code paragraph; select-all and type |
| EditorSyncPlannerTests | `domain/editor/syncPlanner.test.ts` | noChanges; single char → update; enter at end → insert after b; mid-line → update + insert; empty lines; delete; merge → update + delete; paste 3 → one insert; 150 new → insert(start, 100) + insert(afterPending n99, 50); kind change → insert + delete; in-place checked/language; indent/outdent; cascade; token deleted → restore; unknown id → insert; moved [a,b,c,d]→[d,a,b,c] → insert d at start + delete d; hidden children → [] |
| MoveBlockTests | `editor/moveBlock.test.ts` + planner | recreate moved subtree (insert a after c, insert children under pending, delete a); prefer cheap recreate; Alt+Shift+↓/↑ with undo; drop depth clamp; no drop into self |
| WYSIWYGTests | `editor/wysiwyg.test.ts` | every block shortcut + undo restores literal; `- [ ] task`; `# ` mid-line stays literal; `---`+Enter → divider; inline rules; unmatched (`2 * 3`, `snake_case_name`, `a ** b`, `a * x*`, ``` `` ```, `[x](y z)`); toggle bold → `pl**ain**` update; backspace demote then merge; Enter rules incl. to-do(true) → new to-do(false); numbering [1,2,1,2,3,null,1]; paste+copy Markdown round trip |
| EditorFeatureTests | `editor/features.test.ts` | slash filtering table (h → heading1-3 + divider; to → toDo, toggle; c → [code, callout] first); slash kinds; apply + undo; divider insertion; toggle with children ops; callout ops + `blockUpdate` emoji rules; newBlock JSON; callout decoding; collapse ranges; cover decoding; cover cache key ignores query |
| PageEditorEngineTests | `domain/editor/engine.test.ts` with TS fake server | editsAreSaved (exact 4 requests and their order, ids after); emptyLinesAreSaved + remote refresh; nesting; debounce (nothing at 0.3 s, PATCH by 1.8 s); transient failure → offline then success; token restored; mass delete + confirm; toggle & callout (no `icon` key on callout update); typed to-do saved with bold span |
| ImageBlockTests | `engineImages.test.ts` | upload then append (3 requests, multipart shape); too large → no writes; image delete guard (3 deletes → pendingMassDelete 3); multipart exact bytes; backspace selects then deletes, undo restores |
| CaptureTests | `domain/capture/capture.test.ts` | clipboard URL/plain/multiline/unsupported; page to-do and heading plans; database row "Milk tomorrow 5pm" → title "Milk", Due `2026-09-30T17:00:00+02:00`; no date property; empty → null; wire body via queue |
| NaturalDateTests | `domain/capture/naturalDate.test.ts` | the whole dates table (EN + CZ incl. "Odevzdat 1.3." → 2027-03-01, "Report tuesday" on a Tuesday → next week), times table ("Call 9am" after 9 → tomorrow), noDate ("Call Sat" must not parse), whole-text not stripped, middle phrase, nextOccurrence, snooze |
| ReminderTodayTests | `domain/store/reminderToday.test.ts` | fire times by hour; skip past; cap 64 and `limit:5`; summary bodies; identifiers; DueDateParser; Today grouping, overdue, sorting |
| PinSummaryTests | `domain/store/pinSummary.test.ts` | blocks counts; rows checkbox (dueToday 2 incl. datetime); rows status; ratio 0.75; hotkey combos round trip + conflicts (adapt key codes to accelerators) |
| PinCustomIconTests, PinGroupTests | Rust `tests/store.rs` + `domain/store/pinOrdering.test.ts` | old pins.json without customIcon/groupId; CustomIcon JSON round trips; move within group keeps others; deleteGroup ungroups; setGroup appends; groups persist and reorder |
| SharedDataTests | `domain/capture/inbox.test.ts` | JSONL codec skips malformed lines; append/drain; snapshot build (icons "📥", "B"); setChecked idempotent; captureMapping; toggleMapping; `brink://pin/abc-123` round trip |
| WindowCustomizationTests | `domain/store/notchGeometry.test.ts`, `panelSize.test.ts`, `pillStyle.test.ts`, `displayPreference.test.ts` | clamp (10,10)→(300,240), (5000,5000,maxH 800)→(900,800), minimums win; per-pin persistence; pill migration; labels "7/12", "58%", "0%"; rects (window 1000×500, depth 40, length 200, flare 10): top body (400,0,200,40), top bounding (390,0,220,40), right body (960,150,40,200), left bounding (0,140,40,220); `maxLength` 620/815/144/0; display preference resolution. Window frames: convert the AppKit bottom-left cases to top-left before asserting |
| ViewFilterTests | `domain/notion/viewFilter.test.ts` | every operator's JSON; any-of → `or`; within next 7 days → `and` of on_or_after/on_or_before; combined filters; sorts JSON |

Fake server (`src/test/fakeNotion/`): port `FakeNotionServer.swift` routes exactly (pages GET; blocks children GET/PATCH with `position` start/after_block and the 400 "after_block is not a child of the parent"; block PATCH with type-mismatch 400; DELETE; file_uploads create/send; ids `new-N` and `fu-N` from one counter; `failNextWrites(n)` → network errors not logged; `remoteEdit`; request log as `"METHOD /path"`). Use it as a `fetch` stub for TS tests and as the base of the Rust demo server (6.3).

### 3.l Share target, `brink://` protocol and "Send to Brink"
- Register `brink` with `tauri-plugin-deep-link` (writes `HKCU\Software\Classes\brink`; NSIS also registers it). Routes: `brink://pin/<id>` → open pin (parity with `SharedContainer.pinURL`, rejects empty id); `brink://oauth/callback?code&state` (dormant OAuth); **`brink://capture?text=…&url=…&pin=…`** (new, URL-encoded) → `InboxCapture.plan` → write queue → toast "Added to <title> ✓"; `brink://notify?…` (3.f).
- **"Send to Brink" Explorer context menu** (adapted Share extension): NSIS adds `HKCU\Software\Classes\*\shell\SendToBrink` ("Send to Brink", icon Brink.exe) for `.txt`, `.md`, `.url` files: runs `Brink.exe --share "<path>"`; Brink reads up to 64 KB of text (or the URL from a `.url` file), then shows the capture window prefilled (note + URL, destination "Last used pin"), mirroring the Share sheet (Save to Brink, Note, URL (optional), Cancel/Save). Windows 11's modern context menu shows it under "Show more options"; a sparse-package `IExplorerCommand` is deferred.
- **MSIX share target** (Store build only, deferred to post-1.0): `uap:ShareTarget` with `Text` and `Uri` formats.
- Browser "share": not available on Windows desktop; the website FAQ suggests copying the URL and using Ctrl+Alt+V (clipboard append).

### 3.m Widget (deferred)
The Windows 11 Widgets Board requires a packaged app (MSIX) implementing `IWidgetProvider` (COM, Windows App SDK) with Adaptive Card templates; interactive checkboxes need `Action.Execute` round trips to the provider. That is a separate C# or Rust COM project and needs MSIX. Defer to after 1.0. Keep `WidgetSnapshot.build` ported and tested so the provider can read `%LOCALAPPDATA%\Brink\widget-snapshot.json` later. The tray flyout (3.h) covers the "glance and tick" use case in v1.

---

## 4. Milestones

Every milestone ends with the checklist in 6.4 copied into `windows/PROGRESS.md`. "Done when" bullets are the acceptance criteria; each must be backed by a test name, a CI run or a screenshot path.

### M0. Scaffold and CI
**Scope:** create `windows/` with Tauri 2 + React 19 + TS strict + Vite + CSS Modules + Motion + Vitest + Playwright + ESLint; Rust crate with clippy/fmt; version sync; CI.
**Files:** `windows/package.json`, `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.mjs`, `.gitignore`, `README.md`, `DECISIONS.md` (D1-D12), `PROGRESS.md`, `scripts/sync-version.mjs`, `src/main.tsx`, `src/routes.tsx`, `src/styles/tokens.css`, `src/ipc/{commands,events,types,mock}.ts`, `src-tauri/{Cargo.toml,build.rs,tauri.conf.json,capabilities/default.json,rust-toolchain.toml}`, `src-tauri/src/{main.rs,lib.rs,error.rs,paths.rs,logging.rs}`, `.github/workflows/windows-ci.yml`.
**Done when:**
- [ ] `npm run tauri dev` opens a placeholder window on Windows; `npm run dev:web` serves the app in a browser with mocked IPC.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` (one smoke test), `cargo test`, `cargo clippy -D warnings` pass locally and on `windows-latest`.
- [ ] `scripts/sync-version.mjs` reads repo `VERSION` ("0.10.0 (2)") and writes `0.10.0` into `package.json` and `tauri.conf.json`; a Vitest test asserts they match (BrandingTests parity).
- [ ] The em-dash scanner test exists and passes.
- [ ] `paths.rs` resolves `%APPDATA%\Brink`, `%LOCALAPPDATA%\Brink\cache`, logs, and the demo temp root; unit-tested with overridden env vars.

### M1. Notion client, storage and the parity tests for the core
**Scope:** 3.d, 3.e, 2.6 stores, write queue, request encoders; TS domain models and decoders; fixtures.
**Files:** `src-tauri/src/notion/*`, `queue/*`, `store/*`, `secrets.rs`, `commands/{auth,notion_cmds,pins,settings,cache,queue}.rs`, `src-tauri/tests/*`; `src/domain/notion/*`, `src/domain/store/{pin,pinOrdering,panelSize,displayPreference,pillStyle}.ts`, `windows/fixtures/*`; `src/state/{bridge,pinsStore,groupsStore,settingsStore,authStore,queueStore}.ts`.
**Done when:**
- [ ] NotionClientTests ported (Rust, wiremock): retry after 429 ≥ 0.9 s, 4×429 → rateLimited, spacing ≥ 0.3 s (and ≤ 0.45 s), 401/404 mapping, missing token, `Notion-Version: 2025-09-03` header.
- [ ] RichText, PropertyValue, Decoding, ViewFilter, PinCustomIcon, PinGroup, WindowCustomization (non-geometry) tests ported and green.
- [ ] Queue: FIFO, persistence across restart (kill the process mid-drain in a test), transient stops the drain, permanent drops with `failed`, `retainOnTransientFailure:false` withdraws; every op kind round-trips through `pending.json` fixtures in both Rust and TS.
- [ ] Credential Manager: save/load/kind/delete on Windows CI (`secrets_windows.rs`, target `cz.stepanblaha.brink.test`); memory backend used elsewhere; the token never appears in logs (test greps the log file).
- [ ] A debug page lists search results from a real token (manual, not committed) and from the fake server.

### M2. The notch window (fake data)
**Scope:** 3.a and 3.b with 5 hard-coded fake pins; resting/strip/expanded morph; click-through; focus; DPI; multi-monitor; edges; size presets; outline; reduce motion.
**Files:** `src-tauri/src/window/*`, `commands/notch.rs`; `src/features/notch/*`, `src/features/strip/{Strip,StripIcon,PinIcon}.tsx`, `src/features/panel/{Panel,PanelHeader,ExpandedLayout}.tsx`, `src/theme/{tokens,motion,notchMetrics}.ts`, `src/domain/store/notchGeometry.ts`.
**Done when:**
- [ ] `edgeNotchPath` tests: mirror property, bounding box equals `NotchGeometry.boundingRect`, snapshots; geometry tests from WindowCustomizationTests (rects, maxLength 620/815/144/0) pass.
- [ ] Phase reducer tests with fake timers: hover-in immediate, hover-out after 350 ms (not at 300 ms), re-entry cancels, keep-open ignores outside click, same pin toggles, Esc collapses.
- [ ] WebdriverIO on Windows: notch HWND has `WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST`; it is absent from the Alt-Tab list (enumerate with `EnumWindows` + the Alt-Tab eligibility rule in a test helper); clicks 50 px outside the hot rect reach a test window behind it; clicks inside reach the notch.
- [ ] Typing in a test input in the expanded panel works, and on collapse the previously focused Notepad window is foreground again.
- [ ] Screenshots: resting, strip, expanded on right, left and top edges at 100/150/200 %, two monitors with different DPI, taskbar auto-hide on and off; shape edges are crisp, flares concave, no clipped shadow.
- [ ] Moving the notch between monitors (display setting) and changing scaling while running re-places it within 250 ms without restart.
- [ ] Idle CPU < 1 % with the cursor away from the notch (poll at 10 Hz).

### M3. Pins, search, pinning, strip interactions
**Scope:** real pins from `pins.json`; add flow (search, 300 ms debounce, ↑↓ Enter, page pin); context menu; reorder; Open in Notion; per-pin resize; Settings window stub with the token field so a token can be entered.
**Files:** `src/features/pinning/{AddFlowHeader,PinSearch}.tsx`, `src/features/strip/{useReorder.ts,PinContextMenu.tsx,PinBadge.tsx}`, `src/features/notch/{ResizeGrips.tsx,useResize.ts}`, `src/features/common/{Menu,Popover}.tsx`, `src/features/settings/ConnectionSection.tsx`.
**Done when:**
- [ ] Search shows pages and data sources with icon fallback (Lucide `file-text` / `database`), "Untitled", kind label, accent check for already-pinned; empty state copy "Not seeing a page? Share it with your integration in Notion (••• → Connections)."
- [ ] Pinning a page adds it with order max+1 and collapses; reorder by drag within a group and among all pins matches `PinStore` tests; Today pin cannot be dragged (drop rejected).
- [ ] Resize grips: edge 6 px, corners 18 px, double-click resets; sizes persist per pin in `settings.panelSizes`, clamped 300-900 × 240-max; the morph does not animate while resizing.
- [ ] Context menu items and order match StripView L76-113; "Open in Notion" uses `notion://` when the protocol is registered, else the browser.
- [ ] Playwright: add-flow keyboard navigation; screenshot of the add flow vs `marketing/screenshots/`.

### M4. Database task view
**Scope:** `DatabaseModel` (port of DatabaseViewModel), database setup, saved views (filters, sorts, view name, show completed), rows, quick add, rename, date chip and picker, status pill, snooze, polling 45 s, cache first, optimistic writes; Edit View.
**Files:** `src/features/database/*`, `src/features/pinning/{DatabaseSetup,ViewBuilder,FilterRow,SortRow}.tsx`, `src/domain/capture/snooze.ts`.
**Done when:**
- [ ] Unit tests for the model with a fake port: filter = done filter (checkbox `equals false` / status `does_not_equal doneValue`, omitted with showDone) AND saved filters; sorts = saved, else date ascending, else `created_time` descending; quick add inserts `temp-<uuid>` at index 0 and removes it on `failed`; `queued` shows "Not synced yet: <msg>"; marking done fades the row (opacity 0, x +8) for 0.8 s then removes it; status un-done picks the first non-done option.
- [ ] Setup flow copy matches DatabaseSetupView ("Which property means done?", "Which status option means done?", "Date property (optional)", "View options", "Pin database" / "Pin as new view" / "Save view"); a view named "This week" creates the title "Sprint · This week".
- [ ] Snooze: Later today (+3h) disabled for date-only, Tomorrow and Next week (Monday) keep the time of day (NaturalDateTests `snooze` cases).
- [ ] Date chip labels Today / Tomorrow / `ddd d MMM` + time, red when before today; "Clear" works.
- [ ] Screenshot of the Sprint demo database matches the Mac task view layout.

### M5. The page editor with sync (split into M5a-M5d)
**M5a. Model, planner, engine (no UI).** Files: `src/domain/markdown/*`, `src/domain/editor/*`, `src/test/{fakeNotion,editorHost}.ts`.
**Done when:**
- [ ] ParagraphSyntax, MarkdownParser, MarkdownSerializer, EditorSyncPlanner and planner parts of MoveBlockTests pass against the TS host model.
- [ ] PageEditorEngineTests and ImageBlockTests pass against the TS fake server with the exact request sequences (e.g. `editsAreSaved` writes exactly PATCH p1, PATCH page-1/children after p1, PATCH t1, DELETE p5).
- [ ] Debounce 700 ms, max 5 passes, retry 15 s, poll 45 s, quiet period 5 s are constants in `engineConfig.ts` with a test each.

**M5b. ProseMirror schema, identity plugin, input rules, keymap, slash menu, toggles and callouts.** Files: `src/editor/{schema,identityPlugin,snapshot,loadDocument,BrinkEditor}.ts(x)`, `inputRules/*`, `keymap/*`, `plugins/{gutter,placeholder,toggleCollapse,slash,atomicGuard,paste}.ts`, `nodeViews/TokenChip.tsx`, `SlashMenu.tsx`.
**Done when:**
- [ ] EditorDocumentTests, WYSIWYGTests and EditorFeatureTests pass against the real ProseMirror `EditorState` (jsdom), using the same `EditorDocPort` the engine uses.
- [ ] Ctrl+Z right after `# ` restores the literal `# `; Enter/Backspace/Tab rules from 3.c.7 each have a test.
- [ ] Playwright: type the demo script "[] Ship the beta", "## Next", "Invite the **first 50** users", "/to" + Enter, and the resulting kinds and spans are correct; screenshot vs `marketing/screenshots/03-editor.png`.

**M5c. Drag handle, Alt+Shift+↑/↓, mass-delete guard, status footer.** Files: `plugins/dragHandle.ts`, `keymap/moveBlock.ts`, `EditorFooter.tsx`.
**Done when:**
- [ ] MoveBlockTests command cases pass; drag with depth by `dx / 24` works in Playwright.
- [ ] Deleting most of a page shows "Not saved: this would delete N blocks." and "Delete N blocks in Notion"; confirming sends the DELETEs.
- [ ] Footer status cycles Saving… → Saved; with the network off it shows "Offline, will retry" and recovers.

**M5d. Find, cover, images, embedded databases, links.** Files: `plugins/find.ts`, `FindBar.tsx`, `CoverStrip.tsx`, `nodeViews/{ImageBlock,UploadingChip}.tsx`, `LinkPopover.tsx`, `src-tauri/src/store/covers.rs`, upload command.
**Done when:**
- [ ] Find: diacritic-insensitive ("zitra" finds "zítra"), "i of n", Enter/Shift+Enter, F3, Esc.
- [ ] Pasting a PNG and dropping a JPG file upload and append (fake server: 3 requests); 21 MB file → the 20 MB error; expired image URL is refreshed.
- [ ] Cover strip renders 56 px with gradient; cover cache key ignores the query (test).
- [ ] An embedded `child_database` token chip opens Notion; compact embedded database view shows 8 rows and "Show all N".

### M6. Peek, badges, live pill, summaries, Today, reminders, sounds
**Files:** `src/services/{pinSummaryService,reminderService,itemActions,sound}.ts`, `src/domain/store/{pinSummary,dueItem,todayAggregator,reminderPlanner}.ts`, `src/features/notch/{PeekCard,PillProgress}.tsx`, `src/features/today/*`, `src-tauri/src/notify.rs`, `commands/notify.rs`.
**Done when:**
- [ ] PinSummaryTests and ReminderTodayTests pass; summary service: cache first, `refreshAll` staggered 0.4 s at start, every **300 s** staggered 0.6 s, one in-flight refresh per pin, page summaries fetch children of up to **6** child-bearing blocks.
- [ ] Peek: appears after 500 ms dwell, dismisses 300 ms after leaving, stays while on the card, card click opens, ticking plays the tick and strikes through.
- [ ] Badges and pill styles (Hidden/Dot/Line/Percent, 7/12 vs 58%) screenshot on all three edges.
- [ ] Today pin (☀️ `brink.today`, first in the strip, "Hide Today" in its menu): "Today · N open", overdue in red, refresh every **30 s** while visible, tick animates out after 450 ms, snooze removes the row.
- [ ] Reminders on Windows: a timed item 2 minutes ahead produces a toast with Mark done / Snooze 1 hour / Open; Done ticks it in Notion (fake server in demo, real in a manual check); Snooze re-delivers after 3600 s (test with a shortened clock in debug); Open expands the pin; morning summary text matches the planner tests; cap 64 enforced.
- [ ] Tick sound parameters unit-tested on the generated buffer (length 1764 samples, peak ≤ 0.18 × 0.5).

### M7. Quick capture, natural dates, clipboard, hotkeys, tray, deep links
**Files:** `src/domain/capture/*`, `src/features/capture/*`, `src/features/tray/*`, `src-tauri/src/{hotkeys,tray,clipboard,deeplink}.rs`, `src/features/settings/{ShortcutsSection,ShortcutRecorder}.tsx`.
**Done when:**
- [ ] NaturalDateTests (all tables), CaptureTests, SharedDataTests (capture and toggle mapping) pass in `TZ=Europe/Prague`.
- [ ] Capture window: 560×150, centered horizontally on the cursor's monitor, 90 px below the work-area top, scale 0.94 → 1 + fade, close after 0.18 s; destination chip ("☰ " prefix for databases, "Choose", "No pins yet"); placeholder "Add to…"; live date chip; Enter saves and closes, Ctrl+Enter saves and stays, Esc cancels; toast "Added to <title> ✓" or "Saved offline, will sync".
- [ ] Toast window: centered 36 px below the work-area top on the cursor's monitor, fade in 0.18 s, hold 1.7 s (errors 2.6 s), fade out 0.35 s, click-through.
- [ ] Clipboard append with Ctrl+Alt+V: URL → linked paragraph, multi-line → Markdown blocks, image → "Images not supported yet", empty → "Clipboard is empty", no page pin → "Open a page pin first"; toast "Pasted into <title> ✓".
- [ ] Hotkeys register with Windows defaults; conflict messages; a combo taken by another app shows the in-use state; the recorder suspends bindings.
- [ ] Tray: left click toggles the flyout above the icon, right click shows the menu, count tooltip; flyout tick and quick add work.
- [ ] `brink://pin/<id>` and `brink://capture?text=Milk` work from Win+R while Brink runs and when it is not running (single instance).

### M8. Settings, appearance, groups, icons, onboarding, About/legal, autostart
**Files:** `src/features/settings/*`, `src/features/iconPicker/*`, `src/features/onboarding/*`, `src/features/about/*`, `src/features/strip/GroupSwitcher.tsx`, `src-tauri/src/autostart.rs`, `commands/windows.rs`.
**Done when:**
- [ ] Settings window 560×540 with sidebar sections Connection, Appearance, General, Groups, Shortcuts and the Mac copy (minus Mac-only items: hardware-notch merge, Login Items wording); every setting in 2.6.5 is editable and applies live (accent, size, edge, display, outline, badge, pill, progress, sounds + Test, Today, reminders, morning summary, peek, tray list, tray count, show welcome again, launch at sign-in).
- [ ] Connection: token field (placeholder "secret_…" / "Token saved"), Save, Test connection → "Connected. Brink can see N items.", Disconnect removes all three credentials; OAuth section hidden while `oauth_available` is false.
- [ ] Groups: switcher popover (All pins, groups, New group…, Manage…), settings list with emoji, name, count, reorder, delete (ungroups).
- [ ] Icon picker 340×440: Emoji (catalog of about 200 with keywords, search, 8 columns, "Also set as page icon in Notion" for pages, "Open emoji panel" sends Win+. ), Symbol (Lucide, 6 columns, accent swatches), Letter (1-2 letters, swatches, "Use"), "Reset to Notion icon".
- [ ] Onboarding 460×440: three steps with the Mac copy, dots, Back, primary button; shows when not completed or no token and no pins; "Add a page" opens the add flow.
- [ ] About 340×420 (icon, "Brink", "Your pages, on the edge.", "Version 0.10.0 (2)", Website, Privacy, Terms, Acknowledgements, "© 2026 Stepan Blaha", non-affiliation line); legal windows render the bundled `legal/*.md`.
- [ ] Autostart on/off verified by signing out and in on the VM.

### M9. Polish, demo mode, accessibility
**Done when:**
- [ ] `Brink.exe --demo` (or `BRINK_DEMO=1`) starts with the Rust fake server seeded with the Mac demo content (Groceries 🛒, Launch plan 🚀, Sprint 🏃, Reading 📚; same blocks, rows, statuses and search results as `F/Demo/DemoContent.swift` and `DemoNotionServer*.swift`), temp storage, memory credentials, sounds off, reminders off, demo defaults (right edge, Line pill, Large size, blue, outline on).
- [ ] Demo backdrop window paints the dusk gradient (160deg `#5c6b9e → #9e85a8 → #eda88f` + dusk light) only in demo mode; `scripts/screens.ps1` captures the screenshot set.
- [ ] Accessibility: every control has an accessible name (UI Automation via WebView2 ARIA), keyboard-only use of strip (arrow keys move focus between pins when the notch has focus via hotkey), Narrator reads pin titles and badge counts, reduce motion respected, contrast of `--text-2` on black documented.
- [ ] Performance: idle CPU < 1 %, working set < 150 MB, panel opens from cache < 150 ms, morph at 60 fps on a 150 % display.

### M10. Packaging, signing, release, website
**Done when:**
- [ ] `npm run tauri build` produces NSIS x64 and arm64 installers and an MSI; per-user install, Start-menu shortcut with AUMID, `brink://` protocol and "Send to Brink" registered; uninstall removes them and offers to delete `%APPDATA%\Brink`.
- [ ] Signed with Azure Trusted Signing if secrets exist (SmartScreen check on a clean VM), otherwise README caveat.
- [ ] `windows-release.yml` uploads assets to the GitHub Release for the tag; winget manifest validated with `winget validate`.
- [ ] Website updates from 7.6 merged and deployed; privacy policy has the Windows paths; CHANGELOG has a Windows section.

---

## 5. Agent working rules

These rules are binding for every milestone. When a rule and convenience conflict, the rule wins.

### 5.1 Files and steps
- [ ] **Small writes.** Write at most about 200 lines per file write or edit. Prefer many small files (one component, one hook, one module per file). A file that grows past ~250 lines gets split.
- [ ] **Build and test after every step.** After each meaningful change run, from `windows/`:
  - `npm run typecheck && npm run lint && npm test` (TS side)
  - `cargo fmt --check && cargo clippy -- -D warnings && cargo test` (in `windows/src-tauri/`)
  - Fix failures before writing more code. Never leave the tree red at the end of a step.
- [ ] **One milestone at a time.** Do not start M(n+1) until every "Done when" bullet of M(n) is checked and recorded in `windows/PROGRESS.md` (milestone, date, evidence: test names, screenshot paths).
- [ ] **Do not touch the Mac app.** Nothing outside `windows/`, `docs/WINDOWS-PORT*.md`, `.github/workflows/windows-*.yml` and, in M10 only and with the owner's review, `website/`, `legal/PRIVACY.md`, `legal/TERMS.md`, `CHANGELOG.md` and the README download section may be changed. `Sources/`, `Tests/`, `project.yml`, `scripts/`, `branding/`, `legal/` are read-only references.

### 5.2 Reference and parity
- [ ] **The Mac app is the spec.** When this plan is silent or ambiguous, read the cited Swift file and copy its behavior. When this plan and the Swift source disagree on a number, the Swift source wins; fix the plan in the same change and note it in `windows/DECISIONS.md`.
- [ ] **Port the tests first.** For every NotionKit module you port, port its Swift test cases (section 3.k and section 6) before or together with the code. A ported module without its ported tests is not done.
- [ ] **Same data model.** Keep field names, enum raw values and file names identical to NotionKit so the JSON stays recognizable (camelCase keys exactly as Swift `Codable` produces them).

### 5.3 Secrets and data
- [ ] **Never commit tokens or real user data.** No Notion tokens, no workspace ids, no real page content, no screenshots of a real workspace. Demo mode and the fake Notion server are the only sources for screenshots and fixtures.
- [ ] `.gitignore` in `windows/` covers `node_modules/`, `dist/`, `src-tauri/target/`, `*.pfx`, `*.p12`, `.env*`, `test-results/`, `playwright-report/`.
- [ ] Never log the token. Logs may contain block ids and error messages, as on the Mac (see legal/PRIVACY.md).

### 5.4 Commits
- [ ] Commit only when the user asks, on a branch (`windows/mN-short-name`), never on `main` directly.
- [ ] **No AI attribution.** No `Co-Authored-By: Claude …` trailers, no "Generated with" lines, in commits or PR descriptions. The repo owner forbids them.
- [ ] Commit messages follow the repo style: short imperative summary (`Windows: notch window click-through and DPI`).

### 5.5 Brand and copy
- [ ] Follow branding/BRAND.md: the name is always **Brink**; pure black notch; accent presets only; calm, short, no exclamation marks.
- [ ] **No em dashes (U+2014) in UI copy.** Use a period, comma, colon or "·". A unit test scans `windows/src/**/*.{ts,tsx,json}` string literals for U+2014 and fails (mirror of `BrandingTests.swift`).
- [ ] Every place the word Notion appears in marketing or About/legal UI carries the non-affiliation line: "Brink is an independent app and is not affiliated with, endorsed by, or sponsored by Notion Labs, Inc."
- [ ] Never use SF Symbols on Windows (Apple license, see legal/NOTICE.md). Use Lucide icons (ISC license) and map them (section 3.b).
- [ ] The dusk wallpaper is only for demo media and the website simulator. It never appears in the real app.

### 5.6 Visual verification
- [ ] Every UI milestone ends with screenshots taken **on Windows** (VM or real machine) in demo mode at 100 %, 150 % and 200 % scaling, stored in `windows/docs/screens/mN/` and compared against the Mac screenshots in `marketing/screenshots/`.
- [ ] Use Playwright against the Vite dev server (browser mode, mocked Tauri API) for layout checks, and WebdriverIO with `tauri-driver` for real-window checks on Windows.

### 5.7 Decisions
- [ ] Record every non-trivial decision (library choice, deviation from the Mac behavior, anything marked "adapted") in `windows/DECISIONS.md` as a dated entry: context, decision, consequence. Start it in M0 with the decisions in section 2.1 of this plan.
- [ ] When stuck for more than ~30 minutes on a platform quirk, write down what was tried in DECISIONS.md, pick the simplest working fallback listed in this plan, and move on.

---

## 6. Testing and verification on Windows

### 6.1 Test layers
| Layer | Tool | Runs where | What |
|---|---|---|---|
| Pure TS logic (ported NotionKit: editor model, planner, parsers, natural dates, filters, stores' pure parts) | Vitest (`npm test`) | macOS, Linux, Windows CI | The parity spec: every Swift test case listed in 3.k, same inputs, same expected outputs. Fake clock via `vi.useFakeTimers()` with a fixed `now` and the time zone pinned with `TZ=Europe/Prague` (natural date tests depend on it). |
| Rust core (HTTP client, rate limiter, retry, storage, keyring, write queue persistence) | `cargo test` + `wiremock` crate | All CI OSes; keyring tests only on Windows | Mirror `NotionClientTests.swift`, the queue and store tests. The keyring test writes and deletes target `cz.stepanblaha.brink.test`. |
| End-to-end sync (engine + client + fake server) | Vitest calling Rust through a thin test harness, or pure TS against the TS fake server | All | Mirror `PageEditorEngineTests.swift` / `MoveBlockTests.swift` / `ImageBlockTests.swift` with `FakeNotionServer` ported to TS (`windows/src/test/fakeNotion/`). |
| Components in the browser | Playwright (`npm run test:ui`) against `vite dev` with `@tauri-apps/api/mocks` (`mockIPC`) | macOS and Windows CI | Layout of strip, panel, database view, editor interactions (typing Markdown, slash menu, toggles, find), quick capture parsing preview, settings. Screenshot assertions with `toHaveScreenshot` (Chromium, threshold 0.2 %). |
| Real windows | WebdriverIO + `tauri-driver` + `msedgedriver` | Windows only (VM or `windows-latest`) | Window styles, click-through toggling, focus behavior, tray, hotkeys (synthesized with `SendInput` from a test helper binary), toast activation (manual). |
| Visual on real Windows | Manual + screenshot script | Windows 11 VM | `windows/scripts/screens.ps1` launches `Brink.exe --demo`, drives phases with debug commands, captures with `Graphics.CopyFromScreen` at 100/150/200 % scaling, saves to `windows/docs/screens/mN/`. |

### 6.2 Developing from a Mac
1. **VM:** Parallels Desktop (or UTM, slower) with Windows 11 ARM64. Install: Visual Studio 2022 Build Tools (C++ workload, ARM64 + x64 MSVC, Windows 11 SDK), Rust (`rustup target add aarch64-pc-windows-msvc x86_64-pc-windows-msvc`), Node 22, Git, WebView2 (preinstalled). Share the repo folder, but **build inside the VM on a local NTFS path** (`C:\dev\brink`), syncing with `git pull`, because Cargo on a shared folder is slow and file watching fails.
2. **Second monitor and DPI:** in Parallels, enable two displays and set one to 150 % and one to 100 % (Settings → Display) to test mixed DPI. Test taskbar left/top via the registry-free method (Windows 11 23H2+ only supports bottom; test left/top taskbar on Windows 10 22H2 VM or skip and mark as tested by unit tests of `placement.rs` with synthetic rects).
3. **CI:** `windows-latest` (x64) for build, Vitest, cargo test, and the WebdriverIO smoke suite (headful runner sessions work on GitHub-hosted Windows images). ARM64 is built with cross-compilation on `windows-latest` (`--target aarch64-pc-windows-msvc`), tested only in the VM.
4. **Frontend loop on the Mac:** `npm run dev:web` serves the React app in a normal browser with mocked IPC and a fake transparent "desktop" page that shows the notch on the dusk backdrop. Most UI work (editor, database view, settings) can be done here; window behavior must be verified in the VM.

### 6.3 Demo mode and the fake Notion server
- Port `Sources/NotionDock/Features/Demo/DemoNotionServer*.swift` to Rust as an in-process HTTP server (`axum` or `tiny_http`, bound to `127.0.0.1:0`), seeded with the same sample pages and databases as `DemoContent.swift`, implementing the same routes (see section 3.d endpoint table). Launch with `Brink.exe --demo` or env `BRINK_DEMO=1`.
- Demo mode uses a temporary storage root (`%TEMP%\BrinkDemo-<pid>\`), a fake token, sounds off, and never reads the real Credential Manager entry, exactly like the Mac (README "Demo recordings").
- Demo backdrop: a full-screen, click-through, bottom-most window painting the dusk gradient (`linear-gradient(160deg, #5c6b9e, #9e85a8, #eda88f)` plus the "dusk light" layers from BRAND.md) so screenshots match the Mac media. Only in demo mode.
- The scripted demo director (cursor, sequences) is deferred; screenshots are driven by debug commands instead.

### 6.4 Per-milestone verification checklist (template)
Copy into `windows/PROGRESS.md` for each milestone:
- [ ] `npm run typecheck && npm run lint && npm test` green
- [ ] `cargo fmt --check && cargo clippy -- -D warnings && cargo test` green
- [ ] Windows CI green on the branch
- [ ] Ported Swift test cases for this milestone listed with their TS/Rust names
- [ ] Screenshots on Windows 11 (100 %, 150 %, 200 %) saved under `windows/docs/screens/mN/`, compared to `marketing/screenshots/` where a counterpart exists
- [ ] No em dash in new UI strings (test passes)
- [ ] Idle CPU < 1 % and working set < 150 MB with the panel collapsed (Task Manager screenshot). The Mac target was < 80 MB (BRIEF 8); WebView2 adds overhead, so 150 MB is the Windows budget.
- [ ] DECISIONS.md updated for anything adapted or deferred

---

## 7. Packaging and distribution

### 7.1 Identity
| Item | Value | Why |
|---|---|---|
| Product name | `Brink` | BRAND.md |
| Tauri `identifier` | `cz.stepanblaha.brink` | No legacy NotionDock data exists on Windows, so the port starts with the final id (BRAND.md asks to rename before public release). Storage folder stays `NotionDock`-free: `%APPDATA%\Brink\`. Record in DECISIONS.md. |
| AppUserModelID (toasts, taskbar) | `cz.stepanblaha.brink` | Must equal the Start-menu shortcut's AUMID or toasts will not show (section 3.f). |
| Version | read from repo-root `VERSION` (first token, e.g. `0.10.0`) by a build script that writes `tauri.conf.json > version` and `package.json > version` | Mirrors `BrandingTests.swift`, which enforces VERSION = MARKETING_VERSION. Add the same test on Windows. |
| Publisher | `Stepan Blaha` | |
| Copyright | `© 2026 Stepan Blaha. Not affiliated with Notion Labs, Inc.` | Same as `NSHumanReadableCopyright` in project.yml |
| URL protocol | `brink` | Same scheme as the Mac (`CFBundleURLSchemes: [brink]` in project.yml) |
| License | MIT (repo `LICENSE`); name and icon reserved (`TRADEMARKS.md`) | |

### 7.2 Bundles
- **NSIS (primary, per-user install, no admin):** `bundle.targets = ["nsis", "msi"]`, `windows.nsis.installMode = "currentUser"`, `windows.webviewInstallMode = { type: "downloadBootstrapper" }` (Windows 11 ships WebView2; Windows 10 gets it on demand). Output `Brink_<ver>_x64-setup.exe` and `Brink_<ver>_arm64-setup.exe`.
- **MSI (for IT / winget fallback):** WiX, per-machine. Same version.
- **MSIX (Microsoft Store), M10 stretch:** Tauri does not emit MSIX directly. Package the release `Brink.exe` plus resources with `winapp`/`MakeAppx` using `windows/packaging/msix/AppxManifest.xml` (Identity Name `StepanBlaha.Brink`, Publisher from Partner Center, `uap:Protocol Name="brink"`, `desktop:StartupTask TaskId="BrinkStartup"`, `uap:ShareTarget` if 3.l is done). In MSIX, autostart must use the `StartupTask` extension (registry Run keys are virtualized), so `autostart.rs` branches on "running packaged" (`GetCurrentPackageFullName` succeeds).
- Architectures: `x86_64-pc-windows-msvc` and `aarch64-pc-windows-msvc` (the test VM on an Apple Silicon Mac is ARM64).
- Icons: generate `windows/src-tauri/icons/` from `branding/icon-1024.png` with `npx tauri icon`. Tray icon: a separate 16/20/24/32 px monochrome white notch glyph (`tray.ico`) plus a dark variant for light taskbars (`tray-dark.ico`), chosen by reading `HKCU\...\Themes\Personalize\SystemUsesLightTheme`.

### 7.3 Code signing options
| Option | Cost | SmartScreen | Notes |
|---|---|---|---|
| Unsigned | 0 | "Windows protected your PC" on every new version until reputation builds; many users will stop there | Acceptable only for the first private beta. Mirror the Mac caveat text in README ("More info → Run anyway"). |
| OV certificate (e.g. Certum Open Source, Sectigo) | ~€30–€250/yr | Reputation accrues per certificate over downloads; still warns at first | Since 2023 keys must live on a hardware token or cloud HSM, so CI signing needs the vendor's cloud signing tool. Certum's open-source cert is cheapest for an MIT project. |
| **Azure Trusted Signing** (recommended) | ~$9.99/month | Microsoft-rooted, reputation builds quickly | Needs identity validation (individual developers are accepted in supported regions; check CZ eligibility). Signs in GitHub Actions via `azure/trusted-signing-action`. Configure Tauri `bundle.windows.signCommand` to call it. |
| Microsoft Store (individual developer account) | about $19 one-time | Store installs are trusted, no SmartScreen | Requires the MSIX package (7.2). Store certification reviews privacy policy URL (`https://brinknotch.site/privacy/`). Good second channel; does not replace the direct download. |

Decision for the agent: ship M10 with **Azure Trusted Signing** if the owner has set it up (secrets present), otherwise unsigned with the README caveat. Never put a certificate or its password in the repo.

### 7.4 winget
- Manifest set in `windows/packaging/winget/StepanBlaha.Brink/<version>/` (`.yaml` version, defaultLocale, installer), `PackageIdentifier: StepanBlaha.Brink`, installer type `nullsoft` pointing at the GitHub release asset URL, SHA256 from the release job, `Commands: []`, `ReleaseNotesUrl` to the GitHub release.
- Submit with `wingetcreate update StepanBlaha.Brink --version <v> --urls <x64-url> <arm64-url> --submit` from the release workflow (token in `WINGET_TOKEN` secret), or by hand for the first submission (a PR to `microsoft/winget-pkgs`).
- The Homebrew tap (`StepanBlaha/homebrew-tap`, `Casks/brink.rb`) stays Mac-only; do not touch it.

### 7.5 Release workflow
- New `.github/workflows/windows-ci.yml`: on PR and push touching `windows/**`: `windows-latest`, Node 22, Rust stable, `npm ci`, typecheck, lint, Vitest, `cargo test`, `cargo clippy`, `tauri build --debug` (smoke). Upload test reports.
- New `.github/workflows/windows-release.yml`: on tag `v*` (the same tags the Mac release uses, e.g. `v0.11.0`) or manual dispatch: matrix x64 + arm64, `tauri build`, sign (7.3), compute SHA256, then **upload to the existing GitHub Release for that tag** (`gh release upload v$VERSION windows/src-tauri/target/.../*.exe *.msi`). The Mac zip is still produced by `scripts/release.sh`; the two never conflict because asset names differ (`Brink-<v>.zip` vs `Brink_<v>_x64-setup.exe`).
- Optional `latest.json` for `tauri-plugin-updater` (signed with an updater key kept in secrets). Deferred to post-1.0 unless the owner asks; the Mac app has no updater either.
- `CHANGELOG.md` gets a "Windows" subsection per release; keep the Mac entries untouched.

### 7.6 Website updates (M10)
All in `website/` (Next.js static export, CSS Modules, Motion), deployed by the existing `pages.yml` to https://brinknotch.site.
- [ ] `site.ts`: add `downloads: { mac: …/releases/latest, windowsX64: …, windowsArm64: …, winget: "winget install StepanBlaha.Brink" }`. Keep `site.ts` the single source of truth.
- [ ] `DownloadSection.tsx`: a two-option chooser (Mac / Windows) that preselects from `navigator.userAgentData?.platform ?? navigator.userAgent`, shows the Homebrew line for Mac and the winget line for Windows, and system requirements ("Windows 10 22H2 or Windows 11, x64 or ARM64").
- [ ] Hero / meta copy: "on the edge of your Mac's screen" becomes "on the edge of your screen" where it refers to both; keep Mac-only claims (hardware notch merge) labeled.
- [ ] FAQ: add "Does Brink work on Windows?", "Where is my token stored on Windows?" (Windows Credential Manager, target `cz.stepanblaha.brink`), "Why does Windows SmartScreen warn me?" (if unsigned), "How do I uninstall?" (Settings → Apps; then delete `%APPDATA%\Brink`).
- [ ] `llms.txt` route: "Runs on macOS 14 or later and Windows 10/11."
- [ ] Legal pages: `legal/PRIVACY.md` gets a Windows column or paragraph: token in Windows Credential Manager (target names in 3.e), data in `%APPDATA%\Brink\`, cache in `%LOCALAPPDATA%\Brink\cache\`, logs in `%LOCALAPPDATA%\Brink\logs\` (local only), settings in `%APPDATA%\Brink\settings.json`; "Delete all local data" steps for Windows. Changing `legal/` is the one allowed edit outside `windows/` and `website/` in M10, and needs the owner's review. TERMS: "for use on your own Mac" becomes "on your own computer".
- [ ] JSON-LD `SoftwareApplication.operatingSystem`: "macOS 14+, Windows 10, Windows 11".
- [ ] Press kit: add Windows screenshots taken in demo mode on the dusk backdrop.

---

## 8. Risks, open questions, effort

### 8.1 Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| WebView2 transparent window flicker or black background on some GPUs/drivers | notch shows a black rectangle | Keep the HWND size fixed (3.a.1); test on Intel, AMD, NVIDIA and the Parallels virtual GPU; fallback: `DwmExtendFrameIntoClientArea(-1)` + `WS_EX_NOREDIRECTIONBITMAP`; last resort draw the shape with a per-window region (`SetWindowRgn`) updated at the end of each animation |
| Click-through via polling feels laggy | first hover misses | 60 Hz poll near the notch, hot zone padding 30 px already absorbs latency; measure hover-to-strip latency in M2 (< 50 ms) |
| Focus stealing restrictions (`SetForegroundWindow` refused) | can't type in the panel | call it inside the click handler path; `AttachThreadInput` fallback; Alt key-up trick (`keybd_event(VK_MENU)`) as documented fallback |
| Alt+Space conflicts (system menu, PowerToys Run) | default hotkey fails | registration-failure UI (3.g); offer Ctrl+Alt+Space as a one-click alternative |
| Toast activation for unpackaged apps | actions do nothing when Brink is closed | protocol activation `brink://notify` (3.f); verify on a clean VM |
| ProseMirror identity edge cases differ from NSTextStorage | duplicated or lost blocks in Notion | port EditorDocumentTests first (M5b) against the real PM state; the post-pass self-check re-plan (PEE L494-502) logs any drift; fake-server end-to-end tests |
| IME (Japanese/Chinese/Czech dead keys) breaking input rules | wrong conversions | skip input rules during composition (`view.composing`), like the Mac (marked text) |
| Notion API changes (2025-09-03 data sources) | breakage | single client module; version constant; Notion changelog check per release |
| SmartScreen warnings for unsigned builds | users abandon install | Azure Trusted Signing; Store channel |
| Memory of WebView2 (several windows) | > 150 MB | create settings/about/onboarding on demand and destroy on close; capture/toast/tray share one hidden pool if needed |
| Virtual desktops | notch missing on other desktops | documented API check and re-show on hotkey (3.a.6) |
| Rich text loss (underline, color, mentions) inherited from the Mac | edits strip formatting | same behavior as Mac (parity); flagged in section 9; do not "fix" silently on one platform |

### 8.2 Open questions for the owner
1. Code signing: set up Azure Trusted Signing (about $9.99/month) or ship unsigned first? Is the owner eligible as an individual in CZ?
2. Microsoft Store (about $19 one-time, MSIX) in v1 or later?
3. Keep Alt+Space as the default `toggleLastPin` on Windows, or default to Ctrl+Alt+Space to avoid the system-menu clash?
4. Should the Windows build fix the Mac bugs listed in section 9 (clipboard key mismatch, mass-delete undercount, cached block text) or keep strict parity until the Mac is fixed too? This plan fixes only the clipboard key (it makes the feature work at all) and keeps the rest.
5. Hide the notch in full-screen apps by default (`hideInFullScreen = true`)? The Mac stays visible.
6. Windows 10 support: keep (22H2 until its end of support) or Windows 11 only?
7. Will OAuth ever be enabled? If so, the broker redirect stays `brink://oauth/callback`; confirm the same Notion public integration may serve both platforms.
8. App id: `cz.stepanblaha.brink` on Windows while the Mac keeps `cz.stepanblaha.notiondock`; OK?

### 8.3 Effort estimate (one experienced agent-assisted developer, focused days)
| Milestone | Estimate | Notes |
|---|---|---|
| M0 scaffold and CI | 1-2 d | |
| M1 client, storage, core tests | 4-6 d | many encoders and fixtures |
| M2 notch window | 6-9 d | highest platform risk; VM testing of DPI and monitors |
| M3 pins and add flow | 3-4 d | |
| M4 database view | 4-5 d | |
| M5a model, planner, engine | 5-7 d | pure port, test-driven |
| M5b schema, identity, input rules, slash | 7-10 d | hardest UI part |
| M5c drag, move, mass delete | 2-3 d | |
| M5d find, cover, images, embeds | 3-4 d | |
| M6 peek, summaries, Today, reminders | 5-7 d | toast scheduling and activation |
| M7 capture, dates, hotkeys, tray, links | 5-6 d | |
| M8 settings, groups, icons, onboarding, about | 5-6 d | |
| M9 polish, demo, a11y | 4-5 d | |
| M10 packaging and release | 3-4 d | signing setup time not included |
| **Total** | **57-78 d** | about 3 to 4 months part-time equivalent |

---

## 9. Appendix: inconsistencies found in the Mac code
Listed so the porting agent does not "discover" them as Windows bugs. Unless noted, **keep Mac behavior** (parity) and record the item in DECISIONS.md.
1. **Cached blocks lose their text** (`NK/Notion/Block.swift` encode writes request-shape `rich_text` without `plain_text`; the decoder requires `plain_text`, errors swallowed by `try?`). Windows: cache raw API block JSON instead (adapted, harmless).
2. **Clipboard append reads the wrong key** (`F/Clipboard/ClipboardAppendController.swift` reads `NotionDock.lastOpenedPinID`, the app writes `lastOpenedPinID`), so it likely always says "Open a page pin first". Windows: use `lastOpenedPinID` (fixed).
3. **Mass-delete guard counts top-most delete ops**, not deleted blocks (PEE L349-351): deleting one parent with many children does not trigger it. Keep; open question 4.
4. **`NotionError.notShared` is never produced**; `unauthorized`/`missingToken` are transient, so a bad token blocks the queue indefinitely (NotionError.swift L33).
5. **Retry counter shared by 429 and 5xx**; `Retry-After` HTTP-date ignored; no request timeout (NotionClient.swift L208-217).
6. **ViewFilter dates use UTC** (`ISO8601DateFormatter` default), while summaries and natural dates use local time (ViewFilter.swift L152-156). Near midnight "today" filters can be off by a day. Windows keeps parity (UTC), and the tests use the same UTC-midnight reference; fix both platforms together if the owner decides to.
7. **Strip group-switcher slot** is budgeted as `iconSize + iconSpacing + 6s` but drawn about 10 pt smaller (Theme L143 vs StripView L55, L356); hotkey icon positions are slightly off.
8. **Peek pass-through height** always uses 3 items while drawing uses `nextItems.count`; peek width uses metricsScale and height fontScale.
9. **Dot pill is unscaled**, `peekRoom` is unused, `hotZonePadding` is unscaled.
10. **Collapse timer does not re-check the cursor** when it fires (DockController L929-934).
11. **Em dashes in user-visible strings:** "Offline — will retry" (PEE status) and "Restored a block that can't be deleted here — use Notion." (PEE L570-580), plus the legal table separator " — " (LegalDocument.swift L45). Windows replaces them (brand rule).
12. **Underline and color are dropped** on every edit (RichText.swift sends `underline:false`, no color); mentions round-trip as plain text.
13. **Markdown diff key is ambiguous** (`SpanRuns.key`): literal `**a**` and bold `a` compare equal, so that change is not saved.
14. **Hidden-children block type change is never written** (ESP L142, L212); token ancestors are never deleted (ESP L253-259).
15. **"Gone" detection compares localized message strings** (PEE L655-657). Windows: compare the error `kind` (`notFound`) or message containing "archived".
16. **Copy/paste is not round-trip safe** for code languages, images and soft breaks (EI L224-243).
17. **`+ ` means bulleted in MarkdownParser.blocks but toggle in ParagraphSyntax**; the former path is only used by capture/clipboard.
18. **Settings shows "N item(s)", onboarding "N page(s)"** for the same test result.
19. **Status databases cannot be un-done** from widget, notifications or Today (InboxCapture L47-50).
20. **Menu-bar count totals all pins** while the list shows the active group.
21. **NaturalDate:** "this Friday" and "next Friday" are the same; mon/wed/sat/sun abbreviations are missing ("Call Sat" must not parse, tested); the NSDataDetector fallback has no Windows equivalent and is dropped (adapted).
22. **Keychain service still `cz.stepanblaha.notiondock`** while scheme and app group use `brink` (no migration).
