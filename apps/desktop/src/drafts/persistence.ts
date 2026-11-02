import type { DraftRecord } from "../generated/DraftRecord";
import type { DraftWrite } from "../generated/DraftWrite";
import { errorMessage } from "../ipc";
import { decodeDraft } from "./decode";
import { DraftDecodeError } from "./decode-error";
import { DraftSizeError, serializeDraft } from "./serialization";
import type { DraftStore } from "./store";

type Transport = {
  read: () => Promise<DraftRecord[]>;
  write: (value: DraftWrite) => Promise<DraftRecord>;
};
const SAVE_DELAY_MS = 500;
export type OversizedDraft = { key: string; value: unknown };
export type QuarantinedDraft = { record: DraftRecord; reason: string };
type DecodedDraft = {
  record: DraftRecord;
  value: unknown;
  issue: QuarantinedDraft | null;
};
export class DraftPersistence {
  private quarantined: QuarantinedDraft[] = [];
  private resetting = new Map<QuarantinedDraft, Promise<void>>();
  private oversizedValue: OversizedDraft | null = null;
  private revisions = new Map<string, number>();
  private dirty = new Set<string>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private loading: Promise<void> | null = null;
  private loaded = false;
  private label = "초안 불러오는 중…";
  private unsubscribe: () => void;
  constructor(
    private store: DraftStore,
    private transport: Transport,
  ) {
    this.unsubscribe = store.onWrite((key) => {
      this.dirty.add(key);
      this.setStatus("초안 저장 대기 중…");
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, SAVE_DELAY_MS);
    });
  }
  status = () => this.label;
  oversizedDraft = () => this.oversizedValue;
  quarantinedDrafts = () => this.quarantined;
  discardQuarantined = (issue: QuarantinedDraft): Promise<void> => {
    const running = this.resetting.get(issue);
    if (running) return running;
    if (!this.quarantined.includes(issue)) return Promise.resolve();
    const resetting = this.resetQuarantined(issue).finally(() =>
      this.resetting.delete(issue),
    );
    this.resetting.set(issue, resetting);
    return resetting;
  };
  private async resetQuarantined(issue: QuarantinedDraft) {
    const { key } = issue.record;
    try {
      const record = await this.transport.write({
        key,
        schemaVersion: 1,
        expectedRevision: this.revisions.get(key) ?? issue.record.revision,
        valueJson: null,
      });
      this.revisions.set(key, record.revision);
      this.quarantined = this.quarantined.filter((value) => value !== issue);
      this.store.forgetUnchanged(key);
      this.store.unblock(key);
      if (this.store.hasChanges(key)) this.dirty.add(key);
      await this.flush();
    } catch (reason) {
      this.setStatus(`초안 복구 실패: ${errorMessage(reason)}`);
      throw reason;
    }
  }
  discardOversized = (issue: OversizedDraft) => {
    if (this.oversizedValue === issue) this.store.clear(issue.key, issue.value);
    return this.flush();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  load = (): Promise<void> => {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = this.hydrate().finally(() => {
      this.loading = null;
    });
    return this.loading;
  };
  private async hydrate() {
    try {
      const values = (await this.transport.read()).map((record) =>
        this.decodeRecord(record),
      );
      this.quarantined = values.flatMap(({ issue }) => (issue ? [issue] : []));
      for (const { record, value, issue } of values) {
        this.revisions.set(record.key, record.revision);
        if (issue) this.store.block(record.key);
        else if (value !== null) this.store.hydrate(record.key, value);
      }
      this.loaded = true;
      this.setStatus(
        this.dirty.size ? "초안 저장 대기 중…" : "초안 로컬 저장됨",
      );
    } catch (reason) {
      this.setStatus(`초안 복원 실패: ${errorMessage(reason)}`);
      throw reason;
    }
  }
  private decodeRecord(record: DraftRecord): DecodedDraft {
    try {
      return { record, value: decodeDraft(record), issue: null };
    } catch (reason) {
      if (
        !(reason instanceof DraftDecodeError || reason instanceof SyntaxError)
      )
        throw reason;
      return {
        record,
        value: null,
        issue: { record, reason: errorMessage(reason) },
      };
    }
  }
  flush = (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.running = this.save().finally(() => {
      this.running = null;
    });
    return this.running;
  };
  private async save() {
    try {
      await this.load();
      this.oversizedValue = null;
      while (this.dirty.size) {
        const key = this.dirty.values().next().value;
        if (key === undefined) break;
        if (this.store.isBlocked(key)) {
          this.dirty.delete(key);
          continue;
        }
        this.setStatus("초안 저장 중…");
        const value = this.store.peek(key),
          json = this.serialize(key, value);
        const record = await this.transport.write({
          key,
          schemaVersion: 1,
          expectedRevision: this.revisions.get(key) ?? 0,
          valueJson: json ?? null,
        });
        this.revisions.set(key, record.revision);
        if (this.store.peek(key) === value) this.dirty.delete(key);
      }
      this.setStatus("초안 로컬 저장됨");
    } catch (reason) {
      this.setStatus(`초안 저장 실패: ${errorMessage(reason)}`);
      throw reason;
    }
  }
  private serialize(key: string, value: unknown) {
    try {
      return serializeDraft(value);
    } catch (reason) {
      if (reason instanceof DraftSizeError)
        this.oversizedValue = { key, value };
      throw reason;
    }
  }
  private setStatus(label: string) {
    this.label = this.quarantined.length
      ? `${label} · ${this.quarantined.length}건 복원 보류`
      : label;
    for (const listener of this.listeners) listener();
  }
  dispose() {
    clearTimeout(this.timer);
    this.unsubscribe();
  }
}
