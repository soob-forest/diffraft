export class DraftStore {
  private values = new Map<string, unknown>();
  private listeners = new Set<() => void>();

  read<T>(key: string, initial: T): T {
    if (!this.values.has(key)) this.values.set(key, initial);
    return this.values.get(key) as T;
  }

  write<T>(key: string, value: T) {
    this.values.set(key, value);
    for (const listener of this.listeners) listener();
  }

  replace<T>(key: string, expected: T, next: T) {
    if (this.values.get(key) === expected) this.write(key, next);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
