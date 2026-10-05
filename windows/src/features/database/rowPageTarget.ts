/** A database row (a Notion page) to show in the side view, and the pin whose panel hosts it. */
export interface RowPageTarget {
  pinId: string;
  rowId: string;
  title: string;
}

/** The title shown in the header; an empty one reads "Untitled". */
export const displayTitle = (t: RowPageTarget): string => t.title.trim() || "Untitled";

/** The cache key for this row's page, kept apart from the pin's own cache entry. */
export const cacheKey = (t: RowPageTarget): string => `row-${t.rowId}`;

/** A request made before the panel existed (tray, hover peek) is for `pinId` only. */
export const isFor = (t: RowPageTarget, pinId: string): boolean => t.pinId === pinId;

export const sameTarget = (a: RowPageTarget | null, b: RowPageTarget | null): boolean =>
  a === b || (!!a && !!b && a.pinId === b.pinId && a.rowId === b.rowId && a.title === b.title);
