# Real-Windows test checklist

Get the installer from the latest green "Windows" CI run on GitHub, under Artifacts (`brink-windows-nsis`).
Install it on Windows 11 (in UTM or Parallels, or on a real PC), then go through each step below.
Tick a step when it does what it says. If a step fails, write down what happened instead.

## Window (M2)
- [ ] Alt+Tab never shows Brink.
- [ ] Clicking an empty area around the notch reaches the app behind it.
- [ ] Open the panel and type in it, then close it. Notepad gets focus back.
- [ ] At 100 %, 150 % and 200 % scaling, and on mixed-DPI monitors, the notch hugs the screen edge.
- [ ] With the taskbar set to auto-hide, the notch doesn't overlap it.
- [ ] In Task Manager, idle CPU stays under 1 % and memory under 150 MB.

## Pins and editor (M3–M5)
- [ ] Drag a pin to reorder it. The right-click menu works.
- [ ] Drop a PNG from Explorer into a page. It uploads and shows.
- [ ] Ctrl+V a screenshot into a page. It uploads and shows.
- [ ] Typing `[] a` makes a to-do, `## b` makes a heading, and `/to` then Enter makes a to-do.

## Alerts, capture, tray (M6–M7)
- [ ] A due reminder shows a notification with Mark done, Snooze and Open, and each button works, including when Brink is closed.
- [ ] Alt+Space, Alt+Shift+Space and Ctrl+Alt+V each fire their action.
- [ ] Win+R with `brink://open?...` opens Brink.
- [ ] Explorer's right-click "Send to Brink" works.
- [ ] Clicking the tray icon opens the flyout in the right place at 100 %, 150 % and 200 %.

## Settings (M8)
- [ ] "Launch at sign-in" survives signing out and back in.
- [ ] Win+. in the icon picker inserts an emoji.
- [ ] The "System" accent follows the Windows accent color.
- [ ] Display choice works with two monitors.

## Demo, accessibility, open task (M9)
- [ ] `Brink.exe --demo` shows the dusk backdrop and the 4 sample pins, and never touches the real token.
- [ ] `scripts\record-demo.ps1` runs and produces screenshots.
- [ ] Narrator reads "Groceries, 4 items open" on the strip, and "Brink, collapsed" or "Brink, open" when the state changes.
- [ ] Tab into the strip, then the arrow keys move between pins.
- [ ] In High Contrast, the notch shows an outline.
- [ ] At 150 % Text size, the UI scales.
- [ ] With "Animation effects" off, the notch doesn't morph.
- [ ] Clicking a task title or its chevron opens its page. Back keeps the scroll position. This works from Today, the peek and the tray too.
