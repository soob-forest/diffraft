import { expect, it, vi } from "vitest";
import { DraftPersistence } from "../src/drafts/persistence";
import {
  MAX_DRAFT_RECORD_BYTES,
  serializeDraft,
} from "../src/drafts/serialization";
import { DraftStore } from "../src/drafts/store";
import type { DraftWrite } from "../src/generated/DraftWrite";

const key = '["request","document1","task1"]';
const otherKey = '["request","document2","task2"]';
it("bounds serialized UTF-8 rather than source character count", () => {
  expect(serializeDraft("a".repeat(MAX_DRAFT_RECORD_BYTES - 2))?.length).toBe(
    MAX_DRAFT_RECORD_BYTES,
  );
  expect(() => serializeDraft("a".repeat(MAX_DRAFT_RECORD_BYTES - 1))).toThrow(
    /크기/,
  );
  expect(() => serializeDraft("한".repeat(MAX_DRAFT_RECORD_BYTES / 3))).toThrow(
    /크기/,
  );
  expect(serializeDraft(undefined)).toBeNull();
});
function fixture() {
  const store = new DraftStore();
  const write = vi.fn(async (value: DraftWrite) => ({
    ...value,
    revision: value.expectedRevision + 1,
    updatedAt: 0,
  }));
  const persistence = new DraftPersistence(store, {
    read: async () => [],
    write,
  });
  store.write(key, { mode: "PATCH", instruction: "\\".repeat(1600 * 1024) });
  store.write(otherKey, { mode: "PATCH", instruction: "다른 초안" });
  return { store, write, persistence };
}

it("detects JSON size before I/O and explicitly clears only that draft", async () => {
  const { store, write, persistence } = fixture();
  try {
    await expect(persistence.flush()).rejects.toThrow(/크기/);
    expect(write).not.toHaveBeenCalled();
    const issue = persistence.oversizedDraft();
    expect(issue?.key).toBe(key);
    if (!issue) throw new Error("크기 초과 복구 대상이 있어야 합니다.");
    await persistence.discardOversized(issue);
    expect(store.read(key, { instruction: "" }).instruction).toBe("");
    expect(store.peek(otherKey)).toMatchObject({ instruction: "다른 초안" });
    expect(write.mock.calls.map(([value]) => value.key)).toContain(otherKey);
    expect(persistence.status()).toContain("저장됨");
    expect(persistence.oversizedDraft()).toBeNull();
  } finally {
    persistence.dispose();
  }
});

it("never clears newer input from an older recovery button", async () => {
  const { store, persistence } = fixture();
  try {
    await expect(persistence.flush()).rejects.toThrow();
    const issue = persistence.oversizedDraft();
    if (!issue) throw new Error("크기 초과 복구 대상이 있어야 합니다.");
    store.write(key, { mode: "PATCH", instruction: "새 입력" });
    await persistence.discardOversized(issue);
    expect(store.peek(key)).toMatchObject({ instruction: "새 입력" });
    expect(persistence.status()).toContain("저장됨");
  } finally {
    persistence.dispose();
  }
});
