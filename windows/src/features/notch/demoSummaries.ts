import { emptySummary, type PinSummary } from "../../domain/store/pinSummary";
import { useSummaryStore } from "../../services/summaryStore";

const ref = (id: string, title: string) => ({ id, title });

/** Dev-only fake summaries for the browser mock workspace (`?summaries=demo`): screenshots of badges, pill, peek and Today. */
export function demoSummaries(now: Date = new Date()): Record<string, PinSummary> {
  const day = (offset: number, h?: number, m = 0) =>
    h === undefined
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m);
  const tasks: PinSummary = {
    ...emptySummary(), openCount: 7, doneCount: 5, total: 12, dueTodayCount: 3,
    nextItems: ["Review pull requests", "Write release notes", "Update dependencies"],
    nextRefs: [ref("t1", "Review pull requests"), ref("t2", "Write release notes"), ref("t3", "Update dependencies")],
    dueItems: [
      { id: "t1", pinId: "pin-0", title: "Review pull requests", due: day(-2), hasTime: false },
      { id: "t2", pinId: "pin-0", title: "Write release notes", due: day(0, 9, 0), hasTime: true },
      { id: "t3", pinId: "pin-0", title: "Update dependencies", due: day(0), hasTime: false },
      { id: "t4", pinId: "pin-0", title: "Plan next sprint", due: day(0, 17, 30), hasTime: true },
    ],
  };
  const reading: PinSummary = {
    ...emptySummary(), openCount: 3, doneCount: 1, total: 4,
    nextItems: ["Designing Data-Intensive Applications", "The Pragmatic Programmer"],
    nextRefs: [ref("r1", "Designing Data-Intensive Applications"), ref("r2", "The Pragmatic Programmer")],
  };
  const projects: PinSummary = {
    ...emptySummary(), openCount: 2, doneCount: 3, total: 5, dueTodayCount: 1,
    nextItems: ["Brink for Windows", "Website refresh"],
    nextRefs: [ref("p1", "Brink for Windows"), ref("p2", "Website refresh")],
    dueItems: [{ id: "p1", pinId: "pin-3", title: "Brink for Windows", due: day(0), hasTime: false }],
  };
  return { "pin-0": tasks, "pin-1": reading, "pin-2": { ...emptySummary(), total: 3, doneCount: 3 }, "pin-3": projects };
}

export function seedDemoSummaries(): void {
  useSummaryStore.getState().replace(demoSummaries());
}
