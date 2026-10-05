/** Hard-coded pins for M2. Real pins arrive with M3; shapes mirror PinItem and PinSummary. */
export interface FakePin {
  id: string;
  title: string;
  icon: string;
  isToday?: boolean;
  open: number;
  total: number;
  next: { id: string; title: string; done: boolean }[];
  badge?: number;
}

export const FAKE_PINS: FakePin[] = [
  {
    id: "today",
    title: "Today",
    icon: "☀️",
    isToday: true,
    open: 4,
    total: 6,
    badge: 3,
    next: [
      { id: "t1", title: "Ship the notch window", done: false },
      { id: "t2", title: "Reply to Anna", done: false },
      { id: "t3", title: "Book dentist", done: true },
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    icon: "✅",
    open: 7,
    total: 12,
    next: [
      { id: "k1", title: "Review pull requests", done: false },
      { id: "k2", title: "Write release notes", done: false },
      { id: "k3", title: "Update dependencies", done: false },
    ],
  },
  { id: "reading", title: "Reading list", icon: "📖", open: 0, total: 0, next: [] },
  {
    id: "notes",
    title: "Notes",
    icon: "📝",
    open: 0,
    total: 3,
    next: [{ id: "n1", title: "Meeting notes", done: true }],
  },
  {
    id: "projects",
    title: "Projects",
    icon: "🚀",
    open: 2,
    total: 5,
    next: [
      { id: "p1", title: "Brink for Windows", done: false },
      { id: "p2", title: "Website refresh", done: false },
    ],
  },
];

export function peekSubtitle(p: FakePin): string {
  if (p.total === 0) return "No tasks";
  if (p.open === 0) return "All done";
  return `${p.open} open`;
}
