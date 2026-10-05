/** Tiny change notifier for plain-class models read through `useSyncExternalStore`. */
export class Observable {
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;
  protected emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}
