# Brink directory listings

Ready-to-paste entries for app lists and directories. Each one is a pull request you open on someone else's repo, or a form you fill in, so do them yourself, one or two a day.

**How to open a list PR on GitHub** (no terminal needed):
1. Open the repo and the file named below → click the ✏️ pencil icon ("Edit this file").
2. GitHub offers to **fork** it. Accept.
3. Paste the entry in the right section, keeping alphabetical order when the list uses it.
4. At the bottom: **Propose changes** → **Create pull request**, then paste the PR title and text below.

Links used below:
- Site: https://brinknotch.site
- Repo: https://github.com/StepanBlaha/Brink
- Icon: https://raw.githubusercontent.com/StepanBlaha/Brink/main/branding/icon-1024.png
- Screenshots: https://raw.githubusercontent.com/StepanBlaha/Brink/main/marketing/screenshots/01-hover-peek.png and `03-editor.png`

---

## 1. open-source-mac-os-apps (big curated list, open source only)

**Repo:** https://github.com/serhii-londar/open-source-mac-os-apps
**File:** `applications.json`. Add the object inside `"applications": [ … ]`. The README is generated from this file, so don't edit the README.

```json
{
  "title": "Brink",
  "short_description": "A notch on your screen edge that keeps your Notion pages and tasks one hover away.",
  "categories": ["productivity", "menubar"],
  "repo_url": "https://github.com/StepanBlaha/Brink",
  "icon_url": "https://raw.githubusercontent.com/StepanBlaha/Brink/main/branding/icon-1024.png",
  "screenshots": [
    "https://raw.githubusercontent.com/StepanBlaha/Brink/main/marketing/screenshots/01-hover-peek.png",
    "https://raw.githubusercontent.com/StepanBlaha/Brink/main/marketing/screenshots/03-editor.png"
  ],
  "official_site": "https://brinknotch.site",
  "languages": ["swift"]
}
```

**PR title:** `Add Brink`
**PR text:**
```
Adds Brink, a free MIT-licensed macOS app (Swift) that puts a small notch on the screen edge for your Notion pages and tasks: hover to peek and tick tasks, click for a Notion-style editor, quick capture, Today view and reminders.

Repo: https://github.com/StepanBlaha/Brink
Site: https://brinknotch.site
```

---

## 2. awesome-macOS

**Repo:** https://github.com/iCHAIT/awesome-macOS
**File:** `README.md` → section **### Productivity**, in alphabetical order (between entries starting with "B").

```markdown
- [Brink](https://brinknotch.site) - A notch on your screen edge that keeps your Notion pages and tasks one hover away. [![Open-Source Software][OSS Icon]](https://github.com/StepanBlaha/Brink) ![Freeware][Freeware Icon]
```

**PR title:** `Add Brink to Productivity`
**PR text:**
```
Brink is a free, open-source (MIT) native macOS app: a notch on the screen edge for your Notion pages and tasks. Hover to peek and tick tasks in place, click for a Notion-style editor, capture tasks from any app with a hotkey.

Repo: https://github.com/StepanBlaha/Brink
```

---

## 3. awesome-mac (jaywcjlove, very large)

**Repo:** https://github.com/jaywcjlove/awesome-mac
**File:** `README.md`, under **Productivity** or **Menu Bar Tools**, whichever fits their current structure. Some lists also keep a Chinese `README-zh.md`, so add the same line there if their CONTRIBUTING asks for it.

```markdown
* [Brink](https://brinknotch.site) - A notch on your screen edge that keeps your Notion pages and tasks one hover away. [![Open-Source Software][OSS Icon]](https://github.com/StepanBlaha/Brink) ![Freeware][Freeware Icon]
```

**PR title:** `Add Brink`
**PR text:** same as awesome-macOS.

---

## 4. Notion tool lists (awesome-notion style)

Search GitHub for `awesome-notion` and pick the lists updated in the last few months. Add Brink under **Apps**, **Desktop** or **Integrations**:

```markdown
- [Brink](https://brinknotch.site) - Free, open-source macOS notch for your Notion pages and tasks: peek, tick, capture and edit without opening Notion.
```

**PR title:** `Add Brink (macOS app)`
**PR text:**
```
Brink is a free, MIT-licensed macOS app that shows your pinned Notion pages and databases in a small notch on the screen edge, with a Notion-style editor, quick capture, Today view and reminders. It uses the official Notion API with the user's own integration and has no tracking.

Repo: https://github.com/StepanBlaha/Brink
```

---

## 5. Directories (forms, about 10 minutes each)

| Site | What to enter |
|---|---|
| **AlternativeTo** (alternativeto.net → "Add app") | **Name:** Brink. **Description:** below. **Platforms:** Mac, Windows (Apple Notes is Mac only). **License:** Free, Open Source. **Tags:** notion, productivity, menu-bar, notch, todo. Then mark it as an alternative to: Notion (desktop), NotchNook, Boring Notch, Notion widgets. |
| **MacUpdate** (macupdate.com/developers) | Developer submission: version 0.11.2, free, the download URL (GitHub latest release), screenshots, description. |
| **Softpedia Mac** (softpedia.com → Submit software) | The same details. |
| **SaaSHub** (saashub.com → Submit) | Name, site, the short description, category "Productivity". |
| **Indie Hackers** (indiehackers.com → Products) | Add the product, then write a short launch post. |

**Short description:**
```
Brink is a free, open-source macOS app that adds a quiet notch to your screen edge for your Notion pages and tasks. Hover to peek and tick tasks in place, click for a Notion-style editor, capture tasks from any app with a hotkey, and see what's due today. No account, no tracking.
```

**Always add:** "Brink is an independent app, not affiliated with Notion."

---

## 6. Homebrew

Users can already install with:
```bash
brew trust stepanblaha/tap   # newer Homebrew asks this once for third-party taps
brew install --cask stepanblaha/tap/brink
```
Tap: https://github.com/StepanBlaha/homebrew-tap. After each release, `scripts/release.sh` prints the new version and sha256 to put into `Casks/brink.rb` there.

The **official** Homebrew cask list (`brew install --cask brink` without the tap) requires a notarized app and some popularity (around 75+ GitHub stars). Submit there after notarization.
