# Security Policy

## Supported versions

Only the latest release of Brink receives security fixes.

| Version | Supported |
|---|---|
| 0.9.x | ✅ |
| older | ❌ |

## What matters most

Brink stores your Notion integration token in the macOS Keychain and talks only to `api.notion.com`. We especially want to hear about:

- the token leaking anywhere outside the Keychain: logs, files, the pasteboard, crash reports
- content from your Notion pages being written outside `~/Library/Application Support/NotionDock/`
- the widget, the Share extension or the shared App Group container exposing data to other apps
- network requests going anywhere other than Notion

## Reporting a vulnerability

Please **don't open a public issue** for security problems.

- Preferred: [report it privately on GitHub](https://github.com/StepanBlaha/Brink/security/advisories/new).
- Or email **stepa15.b@gmail.com** with "Brink security" in the subject.

Include the Brink version (About Brink), your macOS version, the steps to reproduce, and what you expected to happen. You'll get a reply within 7 days. We'll agree on a fix and a disclosure date with you, and credit you in the release notes if you'd like.

## If your token is exposed

Revoke it right away. In Notion, open your integration's settings and choose **Refresh secret**, then paste the new token into Brink Settings → Connection.
