import type { Step } from "./sequence";

/** Pin ids of the demo content (Mac `DemoContent`, Rust `demo::content`). */
export const PIN = {
  groceries: "demo-groceries",
  launch: "demo-launch",
  sprint: "demo-sprint",
  reading: "demo-reading",
} as const;

const wait = (ms: number): Step => ({ t: "wait", ms });
const cmd = (v: string): Step => ({ t: "cmd", v });
const shot = (name: string): Step => ({ t: "shot", name });
const mark = (name: string): Step => ({ t: "mark", name });
const type = (text: string, delay?: number): Step => ({ t: "type", text, ...(delay ? { delay } : {}) });
const key = (k: string, mods?: string): Step => ({ t: "key", key: k, ...(mods ? { mods } : {}) });

/** Loads every pin once while nothing is recorded, so panels open from cache (Mac `warmUp`). */
export const warmUp: Step[] = [
  wait(1500),
  ...[PIN.sprint, PIN.launch, PIN.groceries].flatMap((id) => [cmd(`expanded:${id}`), wait(1400)]),
  cmd("resting"),
  wait(2500),
];

/** Hover, strip, peek and a tick from the peek card. */
const peekAndTick: Step[] = [
  mark("seg-peek"),
  cmd("resting"),
  wait(600),
  cmd("strip"),
  wait(800),
  cmd(`peek:${PIN.groceries}`),
  wait(1100),
  shot("1-peek"),
  { t: "click", sel: '[data-testid="peek"] [aria-label^="Mark done"]', within: "Oat milk" },
  wait(1600),
];

const sprintTasks: Step[] = [
  mark("seg-tasks"),
  cmd(`expanded:${PIN.sprint}`),
  wait(1300),
  shot("2-tasks"),
  { t: "click", sel: '[role="checkbox"]', within: "Fix sync after sleep" },
  wait(1400),
];

/** Types into the Launch plan page like the Mac script: todo, heading, bold, slash menu. */
const editLaunchPlan: Step[] = [
  mark("seg-editor"),
  cmd("strip"),
  wait(600),
  cmd(`expanded:${PIN.launch}`),
  wait(1200),
  { t: "focusEditor" },
  wait(400),
  type("[] Ship the beta"),
  wait(350),
  key("Enter"),
  key("Enter"),
  wait(300),
  type("## Next"),
  key("Enter"),
  wait(250),
  type("Invite the **first 50** users"),
  key("Enter"),
  wait(400),
  type("/"),
  wait(700),
  type("to", 160),
  wait(600),
  shot("4-slash"),
  wait(500),
  key("Enter"),
  wait(300),
  type("Book the launch dinner"),
  wait(600),
  { t: "click", sel: ".gut.check", within: "Record the demo video" },
  wait(900),
  shot("3-editor"),
];

const closeEditor: Step[] = [
  { t: "click", sel: '[aria-label="Close panel"]' },
  cmd("resting"),
  wait(500),
];

const quickCapture: Step[] = [
  mark("seg-capture"),
  { t: "native", name: "capture" },
  wait(700),
  { t: "mark", name: "capture-open" },
  { t: "await", name: "capture-open-done", timeoutMs: 8000 },
  shot("5-capture"),
  wait(400),
  { t: "native", name: "captureHide" },
  wait(900),
];

const trayList: Step[] = [
  mark("seg-tray"),
  { t: "native", name: "tray" },
  wait(900),
  shot("6-tray"),
  wait(1000),
  { t: "native", name: "trayHide" },
  wait(400),
];

/** The marketing timeline (Mac `runFull`): peek, tasks, editor, quick capture, tray list. */
export const full: Step[] = [
  ...peekAndTick,
  ...sprintTasks,
  ...editLaunchPlan,
  ...closeEditor,
  ...quickCapture,
  ...trayList,
  mark("seg-outro"),
  cmd("resting"),
  wait(1000),
];

/** The screenshot set: each state once, no native windows (those are separate webviews). */
export const screens: Step[] = [
  cmd("resting"),
  wait(700),
  shot("0-resting"),
  cmd("strip"),
  wait(800),
  shot("1-strip"),
  cmd(`peek:${PIN.groceries}`),
  wait(1000),
  shot("2-peek"),
  cmd(`expanded:${PIN.sprint}`),
  wait(1300),
  shot("3-tasks"),
  cmd(`expanded:${PIN.launch}`),
  wait(1300),
  shot("4-page"),
  { t: "focusEditor" },
  type("/"),
  wait(500),
  type("to", 120),
  wait(500),
  shot("5-slash"),
  key("Escape"),
  key("Backspace"),
  key("Backspace"),
  key("Backspace"),
  key("f", "ctrl"),
  wait(300),
  type("the", 90),
  wait(400),
  shot("6-find"),
  key("Escape"),
  cmd("resting"),
  wait(500),
  cmd("edge=left"),
  cmd("strip"),
  wait(800),
  shot("7-edge-left"),
  cmd("edge=top"),
  wait(800),
  shot("8-edge-top"),
  cmd("edge=right"),
  cmd("resting"),
  wait(500),
];

export const SCRIPTS: Record<string, Step[]> = { full, screens };
