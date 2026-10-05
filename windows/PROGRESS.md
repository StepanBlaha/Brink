# Progress

## M0 Scaffold and CI (2026-10-05)
- [x] `npm run typecheck`, `npm run lint`, `npm test` (routes, version parity, em dash scanner)
- [x] `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` (paths.rs, error.rs)
- [x] `scripts/sync-version.mjs` + version parity test
- [ ] Windows CI green (see run link in the commit follow-up)

## M1 Notion client, storage, core tests (2026-10-05)
- [x] NotionClientTests ported (Rust, wiremock, `tests/client.rs`): 429 Retry-After >= 0.9 s, 4x429 -> rateLimited (4 sends), spacing 0.3-0.45 s, 401/404, missing token (no request), `Notion-Version: 2025-09-03`; plus 5xx retry-once, shared 429/5xx counter, 401 refresh hook, pagination.
- [x] Endpoints (`tests/endpoints.rs`): create_row, update page/block bodies, append position, delete, upload flow, token never in log file.
- [x] RichText, PropertyValue, Decoding, ViewFilter, PinCustomIcon, PinGroup, WindowCustomization (non-geometry) ported in Vitest (143 tests, 15 files) and Rust (`tests/store.rs`, `settings.rs`, `encode.rs`).
- [x] Queue (`tests/queue.rs`): FIFO, abort-mid-drain then reopen and replay, transient stops drain, permanent drops with `failed`, `retainOnTransientFailure:false` withdraws, all 49 `fixtures/queue-ops/*.json` round-trip in Rust and Vitest, legacy fixtures decode with defaults.
- [x] Secrets: `TokenStore` + Memory/Keyring backends; `tests/secrets_windows.rs` (cfg windows, target `cz.stepanblaha.brink.test`) runs on Windows CI.
- [ ] Debug page listing search results (real token / fake server): deferred to M2/M3 UI work (no committed UI in M1).
- Evidence: `cargo test` (lib 39 + auth 3, client 14, encode 8, endpoints 9, queue 10, settings 8, store 10), `cargo clippy --all-targets -D warnings`, `cargo fmt --check`, `npm run typecheck/lint/test` green on Mac.

## M2 The notch window, fake data (2026-10-05)
- [x] `edgeNotchPath` tests: mirror, sweep flags, bbox == `boundingRect` (3 edges), snapshots (`edgeNotchPath.test.ts`)
- [x] Geometry tests from WindowCustomizationTests incl. maxLength 620/815/144/0 (`notchLayout.test.ts`)
- [x] Phase machine with fake timers: hover-in immediate, hover-out 350 ms (not 300), re-entry cancels, keep-open, same pin toggles, Esc, peek 0.5 s / 0.3 s (`phaseMachine.test.ts`)
- [x] Springs match Theme.Motion (`motion.test.ts`); Rust `placement.rs`, `hit_test.rs` tests
- [x] Win32 code (`win32.rs`) type-checks and passes clippy for `x86_64-pc-windows-msvc` (scratch crate)
- [x] Screenshots (Mac, browser pane): `docs/screens/m2/` right resting/strip/expanded, top strip+peek/expanded, left large expanded with outline
- [ ] Only on real Windows: HWND styles via `debug_window_styles`, Alt-Tab absence, click-through to a window behind, Notepad focus restore, 100/150/200 % and mixed-DPI screenshots, taskbar auto-hide, idle CPU < 1 %
- [ ] Windows CI green (see commit follow-up)

## M4 Database task view (2026-10-05)
- [x] `DatabaseModel` (port of DatabaseViewModel) with injected ports; tests in `databaseModel.test.ts`: done filter (checkbox/status, omitted with showDone) AND saved filters, sorts (saved / date asc / created_time desc), inferConfig, quick add `temp-<uuid>` at 0 + removed on failed, queued -> "Not synced yet: ...", done fades 0.8 s then removes, rollback on failed, status un-done picks first non-done option, rename, snooze, setDate/clear, show completed, 45 s polling, cache first, notFound message.
- [x] Snooze (`domain/capture/snooze.test.ts`): Later today +3h disabled for date-only, Tomorrow/Next week keep time of day, Monday from Monday goes +7.
- [x] Date chip labels Today / Tomorrow / `ddd d MMM` + time, red before today, Clear (`dates.test.ts`, UI).
- [x] UI: quick add, checkbox rows with list-spring exit, rename, date chip + month picker, status pill, snooze context menu, Show completed, compact embedded mode ("Show all N" after 8).
- [x] Screenshots (Vite page `#/dbdemo`, headless Chrome): `docs/screens/m4/task-view.png`, `compact.png`
- [ ] Setup flow copy / ViewBuilder UI ("Pin as new view", "Sprint · This week"): deferred, see DECISIONS
- [ ] Natural-date quick add: waits for NaturalDate port (M7)
- [ ] Screenshot against the Sprint demo DB on Windows, Windows CI green (see commit follow-up)

## M3 Pins, search, pinning, strip interactions (2026-10-05)
- [x] Real pins from the store (browser: in-memory mock `ipc/mockWorkspace.ts`); `pinsStore`/`groupsStore` mutate optimistically then persist, resync on failure (`state/pinsActions.test.ts`)
- [x] Reorder by pointer drag (4 px threshold, target index and shifts in `pinItems.test.ts`), Today drop rejected (`reorderIntent`), verified by drag in the browser pane
- [x] Context menu (Keep open, Change Icon (disabled until M8), Edit View, Move to group, Open in Notion, Unpin), `common/Menu.test.tsx`
- [x] Add flow: search (300 ms debounce, stale answers dropped, `usePinSearch.test.ts`), keyboard nav + Untitled/kind/pinned check/empty copy (`PinSearch.test.tsx`), database setup + View options (`pinning.test.ts`), Edit View prefill
- [x] Resize grips 6/18 px, double-click reset, sizes in `settings.panelSizes`, no morph while resizing (`useResize.test.ts`)
- [x] Group switcher (select, new group, Manage opens settings), Settings stub with token paste/test/disconnect (`ConnectionSection`)
- [x] Panel shows M4 `DatabaseHost` for database pins
- [x] Rust `shell.rs`: `open_in_notion` (notion:// when registered, else https; unit tests), `show_settings`; Windows code type-checked for msvc in a scratch crate
- [ ] Playwright and Windows screenshots (`docs/screens/m3/`) deferred; browser-pane checks done on Mac
- [ ] Windows CI green (see commit follow-up)
