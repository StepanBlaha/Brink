import { blockPlainText, type Block } from "../../domain/notion/block";
import type { Operation } from "../../domain/notion/pendingWrite";
import { miniListSections, type MiniListSection, type OpenCountSummary } from "../../domain/store/miniList";
import type { Pin, PinGroup } from "../../domain/store/pin";
import type { QueueOutcome } from "../../ipc/types";
import type { DatabaseModel } from "../database/databaseModel";
import { Observable } from "../common/observable";

export interface MiniItem {
  id: string;
  title: string;
}

export interface MiniPorts {
  pins(): Pin[];
  groups(): PinGroup[];
  activeGroupId(): string | undefined;
  /** `lastOpenedPinID` from settings.json. */
  lastOpenedPinId(): string | undefined;
  summaries(): Record<string, OpenCountSummary | undefined>;
  hasToken(): boolean;
  cachedBlocks(pinId: string): Promise<Block[] | null>;
  pageBlocks(pin: Pin): Promise<Block[]>;
  databaseModel(pin: Pin): DatabaseModel | null;
  submit(op: Operation): Promise<QueueOutcome>;
  tick(): void;
  contentChanged(pinId: string): void;
}

const untitled = (s: string): string => (s.trim() === "" ? "Untitled" : s.trim());

export function openTodos(blocks: Block[]): MiniItem[] {
  return blocks.flatMap((b) =>
    b.type.kind === "toDo" && !b.type.checked ? [{ id: b.id, title: untitled(blockPlainText(b)) }] : [],
  );
}

/** Port of MiniListModel: expanded sections, lazy open items per pin, optimistic check-off, quick add. */
export class MiniListModel extends Observable {
  expanded = new Set<string>();
  selectedPinId: string | undefined;
  query = "";
  message: string | null = null;
  private items = new Map<string, MiniItem[]>();
  private hidden = new Set<string>();
  private loading = new Set<string>();

  constructor(private readonly ports: MiniPorts) {
    super();
    this.selectedPinId = ports.lastOpenedPinId();
  }

  get sections(): MiniListSection[] {
    return miniListSections(this.ports.pins(), this.ports.summaries(), this.ports.groups(), this.ports.activeGroupId());
  }

  get hasToken(): boolean {
    return this.ports.hasToken();
  }

  /** The last selected/expanded pin when still listed, else the first section. */
  get targetPin(): Pin | undefined {
    const secs = this.sections;
    const id = secs.find((s) => s.pinID === this.selectedPinId)?.pinID ?? secs[0]?.pinID;
    return this.ports.pins().find((p) => p.id === id);
  }

  pinById(id: string): Pin | undefined {
    return this.ports.pins().find((p) => p.id === id);
  }

  setQuery(q: string): void {
    this.query = q;
    this.emit();
  }

  isLoading(pinId: string): boolean {
    return this.loading.has(pinId);
  }

  visibleItems(pinId: string): MiniItem[] {
    const q = this.query.trim().toLowerCase();
    return (this.items.get(pinId) ?? []).filter(
      (i) => !this.hidden.has(i.id) && (q === "" || i.title.toLowerCase().includes(q)),
    );
  }

  openCount(section: MiniListSection): number {
    const loaded = this.items.get(section.pinID);
    const base = this.ports.summaries()[section.pinID]?.openCount ?? loaded?.length ?? 0;
    const hiddenNow = (loaded ?? []).filter((i) => this.hidden.has(i.id)).length;
    return Math.max(0, base - hiddenNow);
  }

  toggleExpanded(pinId: string): void {
    this.selectedPinId = pinId;
    if (this.expanded.has(pinId)) this.expanded.delete(pinId);
    else {
      this.expanded.add(pinId);
      void this.load(pinId);
    }
    this.emit();
  }

  async load(pinId: string): Promise<void> {
    const pin = this.ports.pins().find((p) => p.id === pinId);
    if (!pin || !this.ports.hasToken()) return;
    this.loading.add(pinId);
    this.emit();
    try {
      if (pin.kind === "page") {
        if (!this.items.has(pinId)) {
          const cached = await this.ports.cachedBlocks(pinId).catch(() => null);
          if (cached) this.items.set(pinId, openTodos(cached));
        }
        try {
          this.items.set(pinId, openTodos(await this.ports.pageBlocks(pin)));
        } catch {
          /* keep the cached items */
        }
      } else {
        const vm = this.ports.databaseModel(pin);
        if (!vm) return;
        await vm.load();
        this.items.set(pinId, vm.getState().rows.filter((r) => !vm.isDone(r)).map((r) => ({ id: r.id, title: untitled(r.title) })));
      }
    } finally {
      this.loading.delete(pinId);
      this.emit();
    }
  }

  /** Optimistic hide + tick; unhides and shows the message on failure. */
  async check(item: MiniItem, pin: Pin): Promise<void> {
    this.ports.tick();
    this.hidden.add(item.id);
    this.emit();
    let ok = true;
    if (pin.kind === "page") {
      const out = await this.ports.submit({
        kind: "updateBlock", blockId: item.id, type: "to_do", update: { kind: "checked", checked: true },
      });
      if (out.kind === "failed") {
        ok = false;
        this.message = out.message;
      }
    } else {
      const vm = this.ports.databaseModel(pin);
      if (vm) {
        await vm.toggleDone(item.id);
        const row = vm.getState().rows.find((r) => r.id === item.id);
        if (row && !vm.isDone(row)) {
          ok = false;
          this.message = vm.getState().errorMessage;
        }
      }
    }
    if (ok) {
      this.items.set(pin.id, (this.items.get(pin.id) ?? []).filter((i) => i.id !== item.id));
      this.hidden.delete(item.id);
      this.ports.contentChanged(pin.id);
    } else {
      this.hidden.delete(item.id);
    }
    this.emit();
  }

  async quickAdd(now: Date = new Date()): Promise<void> {
    const text = this.query.trim();
    const pin = this.targetPin;
    if (text === "" || !pin) return;
    this.query = "";
    const temp: MiniItem = { id: `temp-${crypto.randomUUID()}`, title: text };
    this.items.set(pin.id, [...(this.items.get(pin.id) ?? []), temp]);
    this.expanded.add(pin.id);
    this.emit();
    if (pin.kind === "page") {
      const out = await this.ports.submit({
        kind: "appendBlock", parentId: pin.notionId, block: { kind: "toDo", text, checked: false },
      });
      if (out.kind === "failed") {
        this.message = out.message;
        this.items.set(pin.id, (this.items.get(pin.id) ?? []).filter((i) => i.id !== temp.id));
        this.emit();
        return;
      }
    } else {
      await this.ports.databaseModel(pin)?.quickAdd(text, now);
    }
    this.ports.contentChanged(pin.id);
    await this.load(pin.id);
  }
}
