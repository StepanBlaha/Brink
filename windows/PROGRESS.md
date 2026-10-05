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

## M7 Quick capture, natural dates, clipboard, hotkeys, tray, deep links (2026-10-05)
- [x] NaturalDateTests all tables in `domain/capture/naturalDate.test.ts` (TZ=Europe/Prague pinned in vitest.config.ts, now 2026-09-29 10:00), CaptureTests in `capture.test.ts`, SharedData capture and toggle mapping, MiniListTests (`store/miniList.test.ts`), `deepLink.test.ts`.
- [x] Database quick add parses natural dates (`databaseModel.test.ts`: EN and CS, no date property).
- [x] Capture window (560x150 card, destination chip with "☰ " prefix, live date chip, Enter / Ctrl+Enter / Esc; `captureModel.test.ts`, `CaptureView.test.tsx`), toast route, tray flyout (`miniListModel.test.ts`, `TrayFlyout.test.tsx`).
- [x] Clipboard append reads `lastOpenedPinID` (`hub/clipboardAppend.test.ts`: URL, multiline, image, empty, no page pin, offline, failed). Hub handles hotkeys, `brink://` (`deepLinkHandler.test.ts`), startup hotkey failures via `hotkeys_status`.
- [x] Hotkeys domain and Shortcuts UI (`store/hotkeys.test.ts`, recorder suspends bindings, conflict messages, in-use badge).
- [x] Rust: hotkeys, capture/toast placement, tray (flyout position), clipboard, deep link argv, NSIS hooks; 142 cargo tests, clippy and fmt clean.
- [x] Screenshots (Vite page, headless Chrome): `docs/screens/m7/capture.png`, `tray.png`.
- [ ] Only on real Windows: global hotkeys firing, tray click positions at 100/150/200 %, `brink://` from Win+R (running and cold), "Send to Brink" context menu, toast click-through.
- [ ] Windows CI green (see commit follow-up)

## M5a Editor model, planner, engine (2026-10-05)
- [x] Ported: `domain/markdown/*` (paragraphKind, paragraphSyntax, markdownParser, markdownSerializer, spanRuns, slashCommand, listNumbering, inputShortcuts, markdownImport), `domain/editor/*` (types, syncPlanner, plannerOrder, engine, engineImages, engineConfig, blockConvert, blockMoves, ports), `src/test/{fakeNotion,editorHost}.ts`.
- [x] Vitest: ParagraphSyntax, MarkdownParser, MarkdownSerializer, EditorSyncPlanner, MoveBlock (planner + commands on the array host), PageEditorEngine (editsAreSaved with the exact 4 requests, emptyLines + refresh, nesting, debounce, transient, token restore, mass delete, toggle/callout, typed to-do), ImageBlock (engine part), EditorFeature (slash, toggle/callout, kinds, collapse, cover decode), pure parts of WYSIWYG (shortcut tables, inline matches, numbering, paste/copy round trip).
- [x] `engineConfig.ts` constants with a test each: debounce 700 ms, poll 45 s, quiet 5 s, retry 15 s, max 5 passes, hint 4 s.
- [x] Fixes from PORT 9: underline/color kept (also Rust), mass-delete counts nested children, cache holds plain text.
- [ ] Text-level EditorDocumentTests / WYSIWYGTests cases (type, Enter, Backspace, undo of shortcuts, paste in a text view): M5b on the real ProseMirror state.
- [ ] Windows CI green (see commit follow-up)

## M5b Editor UI (2026-10-05)
- [x] `src/editor/`: schema, identityPlugin, snapshot, loadDocument, docPort (`BrinkDoc`, the engine's `EditorDocPort` over ProseMirror), inputRules, keymap (Enter, Backspace, Tab, marks, history), plugins (gutter, placeholder, toggleCollapse, slash, atomicGuard, paste/copy), TokenChip node view, SlashMenu, BrinkEditor, PageHost, ipcEngineApi.
- [x] Vitest on a real `EditorView` (jsdom): WYSIWYG shortcuts incl. undo restoring the literal text, inline marks, Notion keys, paste/copy round trip, EditorDocument identity cases, slash menu, toggle collapse, callouts, gutter widgets, and the exact `editsAreSaved` requests through `PageEditorEngine` on `BrinkDoc`.
- [x] Panel mounts `PageHost` for page pins (Edit in `features/notch/NotchRoot.tsx`); dev page `#/editordemo`; screenshots `docs/screens/m5b/`.
- [ ] Playwright and Windows screenshot vs `marketing/screenshots/03-editor.png` (deferred, see DECISIONS)
- [ ] Link popover, find, images, drag handle, move-block keys, footer: M5c/M5d
- [ ] Windows CI green (see commit follow-up)

## M6 Peek, badges, live pill, summaries, Today, reminders, sounds (2026-10-05)
- [x] PinSummaryTests, ReminderTodayTests ported (`domain/store/*.test.ts`); summary service tests: cache first, 0.4 s / 0.6 s stagger, 300 s interval, one in flight per pin, 6 child-bearing blocks (`services/pinSummaryService.test.ts`).
- [x] Peek with real data and ticking, badges (open / due today), pill label 7/12 vs 58% (`pillModel.test.ts`), reminder peek 3 s (`phaseMachine.test.ts`).
- [x] Today pin `brink.today` first, "Hide Today" menu, overdue red, 30 s refresh, 450 ms tick-out, snooze removes row (`today/todayModel.test.ts`).
- [x] Reminders: planner cap 64, morning summary, service rules (kept toasts, stale snoozes, debounce 1.5/0.3/1.0 s), Done / Snooze 3600 s / Open (`reminderService.test.ts`); Rust registry + toast XML tests; msvc check of delivery.
- [x] Tick sound: 1764 samples, peak <= 0.18 x 0.5, 80 ms throttle (`tickSound.test.ts`, `sound.test.ts`).
- [x] Screenshots (Vite page, headless Chrome, reduce=1): `docs/screens/m6/` peek-right, strip-top, strip-left, pill-percent, pill-line. Today panel, tick and snooze menu checked in the browser pane (not saved).
- [ ] Only on real Windows: toast with Mark done / Snooze / Open, click while Brink is closed, Focus Assist, autoplay of the tick from a toast action.
- [ ] Windows CI green (see commit follow-up)

## M5c Drag handle, move keys, mass-delete guard, footer (2026-10-05)
- [x] `keymap/moveBlock.ts` (`moveBlockTr`, Alt+Shift+Up/Down), `plugins/dragHandle.ts` (pointer events, 3 px threshold, depth = source + round(dx / 24), 2 px accent line with dot, click selects the block), `EditorFooter.tsx` (Saved / Saving... / Offline, will retry / error, "Delete N blocks in Notion").
- [x] Vitest: MoveBlockTests UI parts on a real `EditorView` (`moveBlock.test.ts`), drag math and pointer sequence (`dragHandle.test.ts`), guard counting nested children and DELETEs after confirming, status copy without em dashes (`footer.test.tsx`).
- [ ] Playwright drag test deferred (headless Chrome over CDP drove it instead: `docs/screens/m5cd/drag.png`).

## M5d Find, cover, images, links, embedded databases (2026-10-05)
- [x] Find (`plugins/find.ts`, `FindBar.tsx`): diacritic-insensitive, non-overlapping, "i of n", Enter / Shift+Enter, F3, Ctrl+G, Esc, prefill from a selection under 200 chars, decorations only.
- [x] Cover strip 56 px with gradient (`CoverStrip.tsx`, bytes via `cover_get`; key and 403 refetch were M1 Rust).
- [x] Images: paste and DOM drop (`plugins/images.ts`), Tauri drops via new `read_image_file` command (image extensions only, 20 MB cap), `ImageBlock` and `UploadingChip` node views, expired URL refreshed once, 21 MB error, order kept for several images (`images.test.ts`).
- [x] Link popover Ctrl+K (needs a selection like the Mac), Ctrl+click opens the link (`link.test.ts`).
- [x] Embedded `child_database`: chip header opens Notion, M4 `EmbeddedDatabase` mounts under it (`coverEmbed.test.tsx`).
- [x] Rich-text check: the demo fixture held literal asterisks (not a bug); `richTextLoad.test.ts` proves bold, italic, code, link, underline and color load as marks. The demo now seeds real annotations.
- [x] Screenshots: `docs/screens/m5cd/` (editor, find, link, drag, embed).
- [ ] Only on real Windows: dropping a file from Explorer, pasting a screenshot from the clipboard.
- [ ] Windows CI green (see commit follow-up)


## M10 Packaging, release, website (prep, 2026-10-05)
- [x] NSIS bundle config (per-user, hooks), version sync, `windows-release.yml` (draft only, optional signing), winget templates + `render.sh`, `RELEASING.md`.
- [x] Website: Mac/Windows chooser (`windowsAvailable: false`), FAQ, llms.txt, JSON-LD flag, `legal/PRIVACY.md` Windows section; lint, typecheck, build green.
- [ ] Not done on purpose: no release published, no winget submission, no signing secrets, MSI/MSIX, SmartScreen check on a clean VM, CHANGELOG Windows section, TERMS wording.
