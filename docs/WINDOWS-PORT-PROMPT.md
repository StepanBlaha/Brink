# Kickoff prompt for the Windows port

Paste the block below into the AI coding agent that will build Brink for Windows. It assumes the agent has this repository checked out and can run commands on a Windows 11 machine or VM (or on a Mac with CI on `windows-latest` for the Windows-only parts).

---

```text
You are building Brink for Windows inside this repository, in the folder windows/.

1. Read docs/WINDOWS-PORT.md completely before writing any code. It is the plan and the spec.
   The macOS app (Sources/NotionKit and Sources/NotionDock, and the tests in Tests/NotionKitTests)
   is the reference implementation. When the plan is silent or unclear, read the cited Swift file
   and copy its behavior. If a number in the plan disagrees with the Swift source, the Swift source
   wins: fix the plan and record it in windows/DECISIONS.md.

2. Work milestone by milestone, M0 through M10 (section 4). Do not start a milestone before every
   "Done when" bullet of the previous one is checked and recorded in windows/PROGRESS.md with
   evidence (test names, CI run, screenshot paths). Tell me when a milestone is done and wait for
   my go-ahead before starting the next one.

3. Rules (section 5 has the full list):
   - Write at most about 200 lines per file write or edit. Use many small files.
   - After every step, build and test: npm run typecheck && npm run lint && npm test, and in
     windows/src-tauri: cargo fmt --check && cargo clippy -- -D warnings && cargo test.
     Never leave the tree failing.
   - Port the Swift tests for each module (section 3.k) before or together with the code.
   - Keep the NotionKit data model, JSON shapes, constants and file names (section 2.6).
   - Do not modify anything outside windows/, docs/WINDOWS-PORT*.md and
     .github/workflows/windows-*.yml (M10 may touch website/, legal/, CHANGELOG.md and README,
     with my review). The Mac app stays untouched.
   - Never commit Notion tokens, real page content or personal data. Use demo mode and the fake
     Notion server for fixtures and screenshots.
   - Commit only when I ask, on a branch named windows/mN-short-name. No AI attribution in commits
     or PRs: no Co-Authored-By trailers, no "Generated with" lines.
   - Keep the brand voice from branding/BRAND.md: the name is always Brink, calm and short copy,
     no exclamation marks, no em dashes in UI text, pure black notch, the dusk wallpaper only in
     demo media, and the line "Brink is an independent app and is not affiliated with, endorsed by,
     or sponsored by Notion Labs, Inc." wherever Notion is named in About, legal or marketing.
   - Do not use SF Symbols on Windows. Use Lucide icons.
   - Verify every UI milestone visually on Windows with screenshots at 100 %, 150 % and 200 %
     scaling, saved under windows/docs/screens/mN/ and compared with marketing/screenshots/.
   - Record every decision and every "adapted" or "deferred" item in windows/DECISIONS.md.

4. Start now with M0: read the plan, then create the scaffold, DECISIONS.md (D1-D12 from section
   2.1), PROGRESS.md and the CI workflow. Report what you created and the test results.

Facts: website https://brinknotch.site, repo https://github.com/StepanBlaha/Brink, license MIT
(the name and icon are reserved, see TRADEMARKS.md), Mac Homebrew tap StepanBlaha/homebrew-tap
(leave it alone), Notion API version 2025-09-03.
```
