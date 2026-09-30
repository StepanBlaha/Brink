# Contributing to Brink

Thanks for helping make Brink better.

## The easiest ways to help

- **Report a bug** with the [bug report form](https://github.com/StepanBlaha/Brink/issues/new?template=bug_report.yml).
- **Suggest a feature** with the [feature request form](https://github.com/StepanBlaha/Brink/issues/new?template=feature_request.yml).
- **Security issues:** see [SECURITY.md](SECURITY.md). Please don't report them in public issues.

## Code contributions

Brink is open source under the [MIT License](LICENSE). Pull requests are welcome. For anything bigger than a small fix, please **open an issue first**, so we can agree on the approach before you spend time on it. By opening a pull request, you agree that your contribution is licensed under the MIT License. If you publish your own fork as an app, give it a different name and icon (see [TRADEMARKS.md](TRADEMARKS.md)).

### Setup

- macOS 14 or later, Xcode 26 or later, and [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).
- Full app with widget and Share extension: `./scripts/run-xcode.sh`
- Quick SwiftPM build and tests: `./scripts/run.sh` and `swift test`
- Website: `cd website && npm install && npm run dev`

### Guidelines

- Keep pull requests small and focused, and say what you tested.
- `swift test` must pass. Add tests for logic in `Sources/NotionKit` (there's a fake Notion server in `Tests/NotionKitTests`).
- Follow the existing style: SwiftUI + AppKit, the design tokens in `Theme.swift`, and the voice in [branding/BRAND.md](branding/BRAND.md) (calm, short, no exclamation marks).
- Never commit Notion tokens, real page content or personal data. Record demos in demo mode (`./scripts/record-demo.sh`).
- Brink must never imply it's made by Notion. Keep the non-affiliation line wherever the name Notion appears in marketing.
