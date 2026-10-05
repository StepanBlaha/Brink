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
