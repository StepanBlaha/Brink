/** Fire and forget for store mutations: a failure already resynced the store from Rust. */
export function ignore(p: Promise<unknown>): void {
  p.catch(() => undefined);
}
