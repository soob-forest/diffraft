import { useSyncExternalStore } from "react";

class GenerationActivity {
  private pending = new Map<string, Set<symbol>>();
  private listeners = new Set<() => void>();
  busy = (documentId: string) => Boolean(this.pending.get(documentId)?.size);
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  begin(documentId: string) {
    const token = Symbol(),
      operations = this.pending.get(documentId) ?? new Set<symbol>();
    operations.add(token);
    this.pending.set(documentId, operations);
    this.notify();
    return () => {
      operations.delete(token);
      if (!operations.size) this.pending.delete(documentId);
      this.notify();
    };
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
}
export const generationActivity = new GenerationActivity();
export function useDocumentGeneration(documentId: string) {
  return useSyncExternalStore(generationActivity.subscribe, () =>
    generationActivity.busy(documentId),
  );
}
