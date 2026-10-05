import type { SeedItem } from "../../test/fakeNotion";

/** Browser-dev copy of the demo workspace (Mac `DemoContent`, Rust `demo::content`). */
export const IDS = {
  groceriesPage: "demo-page-groceries",
  launchPage: "demo-page-launch",
  readingPage: "demo-page-reading",
  sprintSource: "demo-ds-sprint",
} as const;

export const DEMO_PIN_SEEDS: [string, "page" | "dataSource", string, string, string][] = [
  ["Groceries", "page", "\u{1F6D2}", IDS.groceriesPage, "demo-groceries"],
  ["Launch plan", "page", "\u{1F680}", IDS.launchPage, "demo-launch"],
  ["Sprint", "dataSource", "\u{1F3C3}", IDS.sprintSource, "demo-sprint"],
  ["Reading", "page", "\u{1F4DA}", IDS.readingPage, "demo-reading"],
];

const todo = (id: string, text: string, checked = false): SeedItem => ({ id, type: "to_do", text, extra: { checked } });
const li = (id: string, text: string): SeedItem => ({ id, type: "bulleted_list_item", text });

export const DEMO_PAGES: Record<string, { emoji: string; blocks: SeedItem[]; nested?: Record<string, SeedItem[]> }> = {
  [IDS.groceriesPage]: {
    emoji: "\u{1F6D2}",
    blocks: [todo("g1", "Oat milk"), todo("g2", "Sourdough bread"), todo("g3", "Basil and cherry tomatoes"), todo("g4", "Coffee beans"), todo("g5", "Lemons", true)],
  },
  [IDS.launchPage]: {
    emoji: "\u{1F680}",
    blocks: [
      { id: "l1", type: "callout", text: "Beta goes out to 200 testers on Friday.", extra: { icon: { type: "emoji", emoji: "\u{1F4A1}" }, color: "gray_background" } },
      { id: "l2", type: "heading_2", text: "This week" },
      todo("l3", "Finish onboarding copy", true),
      todo("l4", "Record the demo video"),
      todo("l5", "Send invites to testers"),
      { id: "l6", type: "heading_2", text: "Notes" },
      li("l7", "Keep the changelog short and friendly"),
      li("l8", "One price, no subscription"),
      { id: "l9", type: "toggle", text: "Open questions" },
      { id: "l10", type: "paragraph", text: "" },
    ],
    nested: { l9: [li("l9a", "Do we need a Windows version?"), li("l9b", "Which launch day works best?")] },
  },
  [IDS.readingPage]: {
    emoji: "\u{1F4DA}",
    blocks: [todo("r1", "The Design of Everyday Things"), todo("r2", "Four Thousand Weeks"), todo("r3", "Piranesi"), todo("r4", "A Psalm for the Wild-Built", true)],
  },
};

/** Sprint rows: title, status, due offset in days, done. */
export const SPRINT_ROWS: [string, string, number | null, boolean][] = [
  ["Polish onboarding screens", "In progress", 0, false],
  ["Fix sync after sleep", "In progress", 0, false],
  ["Write release notes", "Not started", 0, false],
  ["Review pricing page", "Not started", 1, false],
  ["Plan the retro", "Not started", 3, false],
  ["Update the app icon", "Done", -1, true],
];

export const STATUS_OPTIONS = [
  { id: "st-1", name: "Not started", color: "default" },
  { id: "st-2", name: "In progress", color: "blue" },
  { id: "st-3", name: "Done", color: "green" },
];

export function dayString(offset: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Demo settings of the Mac `demoDefaults` that the Rust side seeds into settings.json. */
export const DEMO_SETTINGS = {
  dockEdge: "right",
  pillStyle: "line",
  dockSize: "large",
  accentPreset: "blue",
  notchOutline: true,
  soundsEnabled: false,
  remindersEnabled: false,
  onboardingCompleted: true,
  lastOpenedPinID: "demo-launch",
  quickCaptureLastPinID: "demo-sprint",
} as const;
