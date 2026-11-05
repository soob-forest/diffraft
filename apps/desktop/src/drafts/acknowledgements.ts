export type DraftStorageState = {
  kind: "unknown" | "pending" | "saving" | "saved" | "failed" | "locked";
  message?: string;
};
const UNKNOWN: DraftStorageState = { kind: "unknown" };
const PENDING: DraftStorageState = { kind: "pending" };
const SAVING: DraftStorageState = { kind: "saving" };
const SAVED: DraftStorageState = { kind: "saved" };
export const LOCKED_DRAFT: DraftStorageState = { kind: "locked" };
type Attempt = { value: unknown; state: DraftStorageState };

// DraftStore replaces values immutably. Keep only references, never payload copies.
export class DraftAcknowledgements {
  private confirmed = new Map<string, unknown>();
  private attempts = new Map<string, Attempt>();

  state(key: string, value: unknown): DraftStorageState {
    if (this.confirmed.has(key) && this.confirmed.get(key) === value)
      return SAVED;
    const attempt = this.attempts.get(key);
    return attempt && attempt.value === value ? attempt.state : UNKNOWN;
  }
  pending(key: string, value: unknown) {
    this.attempts.set(key, { value, state: PENDING });
  }
  saving(key: string, value: unknown) {
    this.attempts.set(key, { value, state: SAVING });
  }
  confirm(key: string, value: unknown) {
    this.confirmed.set(key, value);
    if (this.attempts.get(key)?.value === value) this.attempts.delete(key);
  }
  fail(key: string, value: unknown, message: string) {
    if (this.attempts.get(key)?.value !== value) return;
    this.attempts.set(key, { value, state: { kind: "failed", message } });
  }
  interruptPending(message: string) {
    for (const [key, attempt] of this.attempts) {
      if (attempt.state.kind !== "pending") continue;
      this.attempts.set(key, {
        value: attempt.value,
        state: { kind: "pending", message },
      });
    }
  }
  forget(key: string) {
    this.confirmed.delete(key);
    this.attempts.delete(key);
  }
}
