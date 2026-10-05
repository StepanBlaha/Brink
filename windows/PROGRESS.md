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
