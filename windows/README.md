# Brink for Windows

Tauri 2 + React 19 + TypeScript + Vite port of Brink. Plan: `../docs/WINDOWS-PORT.md`. Decisions: `DECISIONS.md`.

## Prerequisites
Node 22+, Rust stable (`rustup`). On Windows also the MSVC build tools; WebView2 is preinstalled on Windows 11.

## Run in dev (macOS or Windows)
```
cd windows
npm ci
npm run tauri dev     # native window (Tauri); Rust + Vite hot reload
npm run dev:web       # browser only, IPC mocked (src/ipc/mock.ts), http://127.0.0.1:1420
```
Windows are routed by URL hash: `#/notch`, `#/capture`, `#/settings`, ...

## Build
```
npm run build               # typecheck + Vite bundle
npm run tauri build -- --bundles nsis   # Windows: unsigned per-user NSIS installer
```
Installer lands in `src-tauri/target/release/bundle/nsis/`.

## Test
```
npm run typecheck && npm run lint && npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```
`npm run sync-version` copies the repo-root `VERSION` into `package.json` and `tauri.conf.json`.

## CI
`.github/workflows/windows.yml` runs all of the above on `windows-latest` and uploads the NSIS installer as an artifact.
