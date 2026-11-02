export class DraftStore {
  private values = new Map<string, unknown>();
  private listeners = new Set<() => void>();
  private writes = new Set<(key: string) => void>();
  private changed = new Set<string>();
  private blocked = new Set<string>();

  read<T>(key: string, initial: T): T {
    if (!this.values.has(key)) this.values.set(key, initial);
    return this.values.get(key) as T;
  }

  write<T>(key: string, value: T) {
    if (this.isBlocked(key)) return;
    this.changed.add(key);
    this.values.set(key, value);
    for (const listener of this.listeners) listener();
    for (const listener of this.writes) listener(key);
  }

  peek(key: string) {
    return this.values.get(key);
  }
  entries() {
    return this.values.entries();
  }
  clear(key: string, expected: unknown) {
    if (this.isBlocked(key)) return false;
    if (this.values.get(key) !== expected) return false;
    this.values.delete(key);
    this.changed.add(key);
    for (const listener of this.listeners) listener();
    for (const listener of this.writes) listener(key);
    return true;
  }
  hydrate(key: string, value: unknown) {
    if (this.changed.has(key) || this.isBlocked(key)) return;
    this.values.set(key, value);
    for (const listener of this.listeners) listener();
  }
  onWrite(listener: (key: string) => void) {
    this.writes.add(listener);
    return () => this.writes.delete(listener);
  }

  replace<T>(key: string, expected: T, next: T) {
    if (this.values.get(key) === expected) this.write(key, next);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  update<T>(key: string, initial: T, transform: (value: T) => T) {
    if (this.isBlocked(key)) return;
    const current = this.read(key, initial),
      next = transform(current);
    if (next !== current) this.write(key, next);
  }
  isBlocked(key: string) {
    return this.blocked.has(key);
  }
  hasChanges(key: string) {
    return this.changed.has(key);
  }
  block(key: string) {
    this.blocked.add(key);
    this.notify();
  }
  unblock(key: string) {
    this.blocked.delete(key);
    this.notify();
  }
  forgetUnchanged(key: string) {
    if (!this.changed.has(key)) this.values.delete(key);
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
}
