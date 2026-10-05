import { parseNaturalDate, type NaturalDateResult } from "../../domain/capture/naturalDate";
import { planCapture } from "../../domain/capture/captureRequest";
import type { DataSourceSchema } from "../../domain/notion/dataSourceSchema";
import type { Operation } from "../../domain/notion/pendingWrite";
import type { Pin } from "../../domain/store/pin";
import type { QueueOutcome } from "../../ipc/types";

/** Injected so the model is testable with fakes (plan 2.4). */
export interface CapturePorts {
  pins(): Pin[];
  /** `quickCaptureLastPinID` from settings.json. */
  lastPinId(): string | undefined;
  setLastPinId(id: string): void;
  submit(op: Operation): Promise<QueueOutcome>;
  retrieveDataSource(id: string): Promise<DataSourceSchema>;
  now(): Date;
}

export type SaveResult = { kind: "saved"; message: string; pinId?: string } | { kind: "failed" };

/** Port of QuickCaptureModel. Plain class; the view subscribes to it. */
export class CaptureModel {
  text = "";
  destinationId: string | undefined;
  errorMessage: string | null = null;
  isSaving = false;
  private fetched = new Map<string, string>();
  private inflight = new Set<string>();
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly ports: CapturePorts) {
    this.reloadDestination();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;
  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  get pins(): Pin[] {
    return this.ports.pins();
  }
  get destination(): Pin | undefined {
    return this.pins.find((p) => p.id === this.destinationId);
  }

  setText(text: string): void {
    this.text = text;
    this.emit();
  }

  setDestination(id: string): void {
    this.destinationId = id;
    this.ports.setLastPinId(id);
    this.emit();
    void this.resolveDateProperty();
  }

  /** Falls back to the first pin when the remembered destination is gone. */
  reloadDestination(): void {
    const id = this.destinationId ?? this.ports.lastPinId();
    this.destinationId = id && this.pins.some((p) => p.id === id) ? id : this.pins[0]?.id;
    this.emit();
    void this.resolveDateProperty();
  }

  get dateProperty(): string | null {
    const pin = this.destination;
    if (!pin || pin.kind !== "dataSource") return null;
    if (pin.config?.dateProperty) return pin.config.dateProperty;
    const f = this.fetched.get(pin.id);
    return f ? f : null;
  }

  /** Live preview of the parsed date (databases with a date property only). */
  get datePreview(): NaturalDateResult | null {
    if (this.dateProperty === null) return null;
    const parsed = parseNaturalDate(this.text, this.ports.now());
    return parsed.date ? parsed : null;
  }

  async resolveDateProperty(): Promise<void> {
    const pin = this.destination;
    if (!pin || pin.kind !== "dataSource" || pin.config?.dateProperty || this.fetched.has(pin.id) || this.inflight.has(pin.id)) return;
    this.inflight.add(pin.id);
    try {
      const schema = await this.ports.retrieveDataSource(pin.notionId);
      this.fetched.set(pin.id, schema.properties.find((p) => p.type === "date")?.name ?? "");
    } catch {
      this.fetched.set(pin.id, "");
    }
    this.inflight.delete(pin.id);
    this.emit();
  }

  /** Saves the current text. `saved` carries the toast message. */
  async save(): Promise<SaveResult> {
    const pin = this.destination;
    if (!pin) {
      this.errorMessage = "Pin a page or database first.";
      this.emit();
      return { kind: "failed" };
    }
    const plan = planCapture(this.text, pin, this.dateProperty, this.ports.now());
    if (!plan) return { kind: "failed" };
    this.isSaving = true;
    this.errorMessage = null;
    this.emit();
    try {
      const out = await this.ports.submit(plan.operation);
      if (out.kind === "failed") {
        this.errorMessage = out.message;
        return { kind: "failed" };
      }
      this.text = "";
      return out.kind === "saved"
        ? { kind: "saved", message: `Added to ${pin.title} ✓`, pinId: pin.id }
        : { kind: "saved", message: "Saved offline, will sync" };
    } catch (e) {
      this.errorMessage = (e as { message?: string }).message ?? String(e);
      return { kind: "failed" };
    } finally {
      this.isSaving = false;
      this.emit();
    }
  }
}
