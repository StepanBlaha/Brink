import { isoString, snoozeTarget, type SnoozeOption } from "../../domain/capture/snooze";
import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import { doneStatusOptionNames } from "../../domain/notion/dataSourceSchema";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { PropertyUpdate, PropertyValue } from "../../domain/notion/propertyValue";
import type { Row } from "../../domain/notion/row";
import type { DatabaseConfig } from "../../domain/store/pin";
import { parseDate } from "./dates";
import { errorText, isNotFound, type DatabasePorts } from "./ports";
import { buildFilter, buildSorts, inferConfig } from "./queryBuilder";

export interface DatabaseState {
  rows: Row[];
  isLoading: boolean;
  errorMessage: string | null;
  schema: DataSourceSchema | null;
  showDone: boolean;
  /** Rows fading out after being marked done (removed after `animateOutMs`). */
  animatingOut: ReadonlySet<string>;
}

export const animateOutMs = 800;
export const pollMs = 45_000;

const withProperty = (r: Row, name: string, value: PropertyValue, title?: string): Row => ({
  ...r,
  title: title ?? r.title,
  properties: { ...r.properties, [name]: value },
});

/** Port of DatabaseViewModel: loads, caches, polls and applies optimistic edits through the write queue. */
export class DatabaseModel {
  readonly dataSourceId: string;
  readonly config: DatabaseConfig | null;
  private state: DatabaseState;
  private listeners = new Set<() => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private loadSeq = 0;

  constructor(
    dataSourceId: string,
    config: DatabaseConfig | null,
    private readonly cacheKey: string,
    private readonly ports: DatabasePorts,
    schema: DataSourceSchema | null = null,
  ) {
    this.dataSourceId = dataSourceId;
    this.config = config;
    this.state = {
      rows: [], isLoading: false, errorMessage: null, schema,
      showDone: config?.showDone ?? false, animatingOut: new Set(),
    };
  }

  /** A database inside a page: resolve the data source and infer the config from the schema. */
  static async embedded(childDatabaseId: string, cacheKeyPrefix: string, ports: DatabasePorts): Promise<DatabaseModel> {
    const sources = await ports.notion.retrieveDatabase(childDatabaseId);
    const first = sources[0];
    if (!first) throw new Error(`Database ${childDatabaseId} has no data sources`);
    const schema = await ports.notion.retrieveDataSource(first.id);
    return new DatabaseModel(first.id, inferConfig(schema), `${cacheKeyPrefix}-${first.id}`, ports, schema);
  }

  // ---- store plumbing ----
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): DatabaseState => this.state;
  private set(patch: Partial<DatabaseState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  get isReadOnly(): boolean {
    return this.config === null;
  }

  /** The status property shown as a trailing pill: only when done is a checkbox and a status property exists. */
  get statusPropertyName(): string | null {
    if (this.config?.doneKind !== "checkbox") return null;
    return this.state.schema?.properties.find((p) => p.type === "status")?.name ?? null;
  }

  /** Status options of the pill property, for the picker. */
  statusOptions(): string[] {
    const name = this.statusPropertyName;
    return this.state.schema?.properties.find((p) => p.name === name)?.statusOptions?.map((o) => o.name) ?? [];
  }

  // ---- loading ----
  async load(showLoading = true): Promise<void> {
    const seq = ++this.loadSeq;
    if (this.state.rows.length === 0) {
      const cached = await this.ports.cache.loadRows(this.cacheKey).catch(() => null);
      if (cached && this.state.rows.length === 0) this.set({ rows: cached });
    }
    if (showLoading && this.state.rows.length === 0) this.set({ isLoading: true });
    try {
      let schema = this.state.schema;
      if (!schema) schema = await this.ports.notion.retrieveDataSource(this.dataSourceId).catch(() => null);
      const rows = await this.ports.notion.queryDataSource(
        this.dataSourceId,
        buildFilter(this.config, this.state.showDone),
        buildSorts(this.config),
      );
      if (seq === this.loadSeq) {
        this.set({ rows, schema, errorMessage: null });
        void this.ports.cache.saveRows(this.cacheKey, rows).catch(() => undefined);
      }
    } catch (e) {
      this.set({
        errorMessage: isNotFound(e) ? "Database not found. Share it with your integration in Notion." : errorText(e),
      });
    }
    this.set({ isLoading: false });
  }

  startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => void this.load(false), pollMs);
  }

  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async setShowDone(on: boolean): Promise<void> {
    if (on === this.state.showDone) return;
    this.set({ showDone: on });
    await this.load(true);
  }

  // ---- row helpers ----
  isDone(row: Row): boolean {
    const c = this.config;
    const v = c ? row.properties[c.doneProperty] : undefined;
    if (!c || !v) return false;
    if (c.doneKind === "checkbox") return v.type === "checkbox" && v.checkbox;
    return v.type === "status" && v.status?.name === c.doneValue;
  }

  statusName(row: Row): string | null {
    const n = this.statusPropertyName;
    const v = n ? row.properties[n] : undefined;
    return v?.type === "status" ? (v.status?.name ?? null) : null;
  }

  private dateStart(row: Row): string | null {
    const p = this.config?.dateProperty;
    const v = p ? row.properties[p] : undefined;
    return v?.type === "date" && v.date ? v.date.start : null;
  }

  date(row: Row): Date | null {
    const s = this.dateStart(row);
    return s ? parseDate(s) : null;
  }

  dateHasTime(row: Row): boolean {
    return this.dateStart(row)?.includes("T") ?? false;
  }

  private firstNonDoneStatus(): string | undefined {
    const c = this.config;
    const p = this.state.schema?.properties.find((x) => x.name === c?.doneProperty && x.type === "status");
    if (!p) return undefined;
    const done = new Set(doneStatusOptionNames(p));
    return p.statusOptions?.find((o) => !done.has(o.name))?.name;
  }

  // ---- actions ----
  async toggleDone(rowId: string): Promise<void> {
    const c = this.config;
    const row = this.state.rows.find((r) => r.id === rowId);
    if (!c || !row) return;
    const wasDone = this.isDone(row);
    const value: PropertyValue =
      c.doneKind === "checkbox"
        ? { type: "checkbox", checkbox: !wasDone }
        : ((n) => (n === undefined ? { type: "status" } : { type: "status", status: { name: n } }))(
            wasDone ? this.firstNonDoneStatus() : c.doneValue,
          );
    const previous = this.state.rows;
    const out = new Set(this.state.animatingOut);
    if (!wasDone && !this.state.showDone) out.add(rowId);
    else out.delete(rowId);
    this.set({ rows: previous.map((r) => (r.id === rowId ? withProperty(r, c.doneProperty, value) : r)), animatingOut: out });
    if (out.has(rowId)) this.scheduleAnimateOut(rowId);
    const update: PropertyUpdate = { name: c.doneProperty, value };
    await this.write({ kind: "toggleDone", pageId: rowId, update }, () => {
      const o = new Set(this.state.animatingOut);
      o.delete(rowId);
      this.set({ rows: previous, animatingOut: o });
    });
  }

  private scheduleAnimateOut(rowId: string): void {
    setTimeout(() => {
      if (!this.state.animatingOut.has(rowId)) return;
      const o = new Set(this.state.animatingOut);
      o.delete(rowId);
      this.set(this.state.showDone ? { animatingOut: o } : { animatingOut: o, rows: this.state.rows.filter((r) => r.id !== rowId) });
    }, animateOutMs);
  }

  /** Plain title (natural dates arrive with M7 / NaturalDate). Inserts `temp-<uuid>` at 0. */
  async quickAdd(title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;
    const tempId = `temp-${crypto.randomUUID()}`;
    this.set({ rows: [{ id: tempId, icon: { type: "none" }, title: trimmed, properties: {} }, ...this.state.rows] });
    const out = await this.ports.queue.submit({ kind: "createRow", dataSourceId: this.dataSourceId, title: trimmed, extra: [] });
    if (out.kind === "failed") {
      this.set({ errorMessage: out.message, rows: this.state.rows.filter((r) => r.id !== tempId) });
    } else if (out.kind === "queued") {
      this.set({ errorMessage: `Not synced yet: ${out.message}` });
    } else {
      this.set({ errorMessage: null });
      await this.load(false);
    }
  }

  async rename(rowId: string, title: string): Promise<void> {
    const trimmed = title.trim();
    const row = this.state.rows.find((r) => r.id === rowId);
    const titleProp = this.state.schema?.properties.find((p) => p.type === "title")?.name;
    if (!trimmed || !row || !titleProp || row.title === trimmed) return;
    const previous = this.state.rows;
    const value: PropertyValue = { type: "title", title: trimmed };
    this.set({ rows: previous.map((r) => (r.id === rowId ? withProperty(r, titleProp, value, trimmed) : r)) });
    await this.write({ kind: "updateProperty", pageId: rowId, updates: [{ name: titleProp, value }] }, () =>
      this.set({ rows: previous }),
    );
  }

  async snooze(rowId: string, option: SnoozeOption, now: Date = new Date()): Promise<void> {
    const row = this.state.rows.find((r) => r.id === rowId);
    if (!this.config?.dateProperty || !row) return;
    const hasTime = this.dateHasTime(row);
    if (option === "laterToday" && !hasTime) return;
    const t = snoozeTarget(option, this.date(row), hasTime, now);
    await this.setDate(rowId, t.date, t.hasTime);
  }

  async setDate(rowId: string, date: Date | null, hasTime = false): Promise<void> {
    const prop = this.config?.dateProperty;
    if (!prop || !this.state.rows.some((r) => r.id === rowId)) return;
    const value: PropertyValue = date ? { type: "date", date: { start: isoString(date, hasTime) } } : { type: "date" };
    await this.updateProperty(rowId, prop, value);
  }

  async setStatus(rowId: string, option: string): Promise<void> {
    const prop = this.statusPropertyName;
    if (!prop || !this.state.rows.some((r) => r.id === rowId)) return;
    await this.updateProperty(rowId, prop, { type: "status", status: { name: option } });
  }

  private async updateProperty(rowId: string, name: string, value: PropertyValue): Promise<void> {
    const previous = this.state.rows;
    this.set({ rows: previous.map((r) => (r.id === rowId ? withProperty(r, name, value) : r)) });
    await this.write({ kind: "updateProperty", pageId: rowId, updates: [{ name, value }] }, () =>
      this.set({ rows: previous }),
    );
  }

  private async write(op: Operation, rollback: () => void): Promise<void> {
    const out = await this.ports.queue.submit(op);
    if (out.kind === "saved") this.set({ errorMessage: null });
    else if (out.kind === "queued") this.set({ errorMessage: `Not synced yet: ${out.message}` });
    else {
      this.set({ errorMessage: out.message });
      rollback();
    }
  }
}
