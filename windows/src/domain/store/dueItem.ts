/** An open database row that has a due date: what reminders and the Today view are built from. */
export interface DueItem {
  id: string;
  pinId: string;
  title: string;
  due: Date;
  /** True when the Notion date carries a time of day; date-only items are due "that day". */
  hasTime: boolean;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Parses the `start` of a Notion date (`2026-09-30` or `2026-09-30T15:00:00.000+02:00`); local zone for floating times. */
export function parseDueDate(start: string): { date: Date; hasTime: boolean } | null {
  if (start.includes("T")) {
    if (!DATE_TIME.test(start)) return null;
    const d = new Date(start);
    return Number.isNaN(d.getTime()) ? null : { date: d, hasTime: true };
  }
  const m = DATE_ONLY.exec(start);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return { date, hasTime: false };
}
