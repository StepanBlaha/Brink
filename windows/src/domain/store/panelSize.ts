export interface Size {
  width: number;
  height: number;
}

export const panelMinWidth = 300;
export const panelMaxWidth = 900;
export const panelMinHeight = 240;

/** Clamps to 300...900 wide and 240...maxHeight tall; minimums always win. */
export function clampPanelSize(size: Size, maxHeight: number, maxWidth: number = panelMaxWidth): Size {
  const width = Math.min(Math.max(size.width, panelMinWidth), Math.max(panelMinWidth, Math.min(panelMaxWidth, maxWidth)));
  const height = Math.min(Math.max(size.height, panelMinHeight), Math.max(panelMinHeight, maxHeight));
  return { width, height };
}

/** `settings.panelSizes`: pinId to [width, height] in logical px. */
export type PanelSizes = Record<string, [number, number]>;

/** The stored size re-clamped to the current limits; `undefined` means "use the default". */
export function panelSizeFor(table: PanelSizes, pinId: string, maxHeight: number, maxWidth: number = panelMaxWidth): Size | undefined {
  const v = table[pinId];
  if (!v || v.length !== 2) return undefined;
  return clampPanelSize({ width: v[0], height: v[1] }, maxHeight, maxWidth);
}

export function setPanelSize(
  table: PanelSizes,
  pinId: string,
  size: Size,
  maxHeight: number,
  maxWidth: number = panelMaxWidth,
): { table: PanelSizes; size: Size } {
  const clamped = clampPanelSize(size, maxHeight, maxWidth);
  return { table: { ...table, [pinId]: [clamped.width, clamped.height] }, size: clamped };
}

export function resetPanelSize(table: PanelSizes, pinId: string): PanelSizes {
  const next = { ...table };
  delete next[pinId];
  return next;
}

export function hasPanelSize(table: PanelSizes, pinId: string): boolean {
  return table[pinId] !== undefined;
}
