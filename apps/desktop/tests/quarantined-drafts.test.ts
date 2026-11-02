import { expect, it, vi } from "vitest";
import * as decoder from "../src/drafts/decode";
import { DraftPersistence } from "../src/drafts/persistence";
import { DraftStore } from "../src/drafts/store";
import type { DraftRecord } from "../src/generated/DraftRecord";
import type { DraftWrite } from "../src/generated/DraftWrite";

const badKey = '["candidate","doc","task","batch","proposal","1"]';
const goodKey = '["request","doc","task"]';
const record = (
  key: string,
  valueJson: string | null,
  schemaVersion = 1,
): DraftRecord => ({
  key,
  valueJson,
  schemaVersion,
  revision: 7,
  updatedAt: 1,
});
function setup(schemaVersion = 1) {
  const raw = record(badKey, '{"after":null}', schemaVersion);
  const store = new DraftStore();
  const write = vi.fn(async (value: DraftWrite) => ({
    ...raw,
    ...value,
    revision: 8,
  }));
  const persistence = new DraftPersistence(store, {
    read: async () => [
      raw,
      record(goodKey, '{"mode":"PATCH","instruction":"정상"}'),
    ],
    write,
  });
  return { raw, store, write, persistence };
}

it.each([1, 99])(
  "isolates malformed/unsupported records (%s) and saves healthy drafts",
  async (schema) => {
    const { raw, store, write, persistence } = setup(schema);
    await persistence.load();
    expect(persistence.quarantinedDrafts()[0].record).toEqual(raw);
    expect(store.isBlocked(badKey)).toBe(true);
    store.write(badKey, { after: "덮어쓰면 안 됨" });
    store.write(goodKey, { mode: "PATCH", instruction: "정상 수정" });
    await persistence.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].key).toBe(goodKey);
    expect(persistence.quarantinedDrafts()).toHaveLength(1);
    persistence.dispose();
  },
);

it("keeps raw data locked on reset failure and resets only after successful CAS", async () => {
  const { store, write, persistence } = setup();
  await persistence.load();
  const issue = persistence.quarantinedDrafts()[0];
  write.mockRejectedValueOnce(new Error("다른 창에서 변경됨"));
  await expect(persistence.discardQuarantined(issue)).rejects.toThrow(
    /다른 창/,
  );
  expect(store.isBlocked(badKey)).toBe(true);
  expect(persistence.quarantinedDrafts()[0]).toBe(issue);
  await Promise.all([
    persistence.discardQuarantined(issue),
    persistence.discardQuarantined(issue),
  ]);
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1][0]).toMatchObject({
    key: badKey,
    expectedRevision: 7,
    valueJson: null,
  });
  expect(store.isBlocked(badKey)).toBe(false);
  await persistence.discardQuarantined(issue);
  expect(write).toHaveBeenCalledTimes(2);
  persistence.dispose();
});

it("keeps transport failures visible instead of pretending hydration succeeded", async () => {
  const persistence = new DraftPersistence(new DraftStore(), {
    read: async () => {
      throw new Error("DB 읽기 실패");
    },
    write: vi.fn(),
  });
  await expect(persistence.load()).rejects.toThrow(/DB/);
  expect(persistence.status()).toContain("복원 실패");
  persistence.dispose();
});

it("retains input created before hydration when explicitly resetting the stored record", async () => {
  const { store, write, persistence } = setup();
  store.write(badKey, { after: "새 입력" });
  await persistence.load();
  await persistence.flush();
  expect(write).not.toHaveBeenCalled();
  await persistence.discardQuarantined(persistence.quarantinedDrafts()[0]);
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1][0]).toMatchObject({
    expectedRevision: 8,
    valueJson: '{"after":"새 입력"}',
  });
  expect(store.peek(badKey)).toEqual({ after: "새 입력" });
  persistence.dispose();
});

it("does not conceal unknown decoder errors or partially hydrate other records", async () => {
  const store = new DraftStore();
  const persistence = new DraftPersistence(store, {
    read: async () => [
      record(goodKey, '{"mode":"PATCH","instruction":"정상"}'),
      record(badKey, '{"after":null}'),
    ],
    write: vi.fn(),
  });
  const original = decoder.decodeDraft;
  const decode = vi
    .spyOn(decoder, "decodeDraft")
    .mockImplementation((value) => {
      if (value.key === badKey) throw new TypeError("예상 밖의 오류");
      return original(value);
    });
  try {
    await expect(persistence.load()).rejects.toThrow(/예상 밖/);
    expect(store.peek(goodKey)).toBeUndefined();
    expect(persistence.quarantinedDrafts()).toHaveLength(0);
  } finally {
    decode.mockRestore();
    persistence.dispose();
  }
});

it("keeps the cached value intact through every blocked write path", () => {
  const store = new DraftStore(),
    value = { after: "보존" };
  store.hydrate(badKey, value);
  store.block(badKey);
  store.write(badKey, { after: "변경" });
  store.replace(badKey, value, { after: "교체" });
  store.update(badKey, value, () => ({ after: "갱신" }));
  expect(store.clear(badKey, value)).toBe(false);
  expect(store.peek(badKey)).toBe(value);
});
