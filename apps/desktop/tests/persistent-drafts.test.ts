import { expect, it, vi } from "vitest";
import { DraftPersistence } from "../src/drafts/persistence";
import { DraftStore } from "../src/drafts/store";
import type { DraftRecord } from "../src/generated/DraftRecord";
import type { DraftWrite } from "../src/generated/DraftWrite";

const key = '["request","document","task"]';
const record = (revision: number, value: unknown): DraftRecord => ({
  key,
  schemaVersion: 1,
  revision,
  valueJson: JSON.stringify(value),
  updatedAt: 1,
});
it("hydration and delayed saves cannot overwrite a newer edit", async () => {
  let restore: (records: DraftRecord[]) => void = () => {};
  const store = new DraftStore();
  const write = vi.fn(async (_request: DraftWrite) =>
    record(2, { mode: "PATCH", instruction: "new" }),
  );
  const persistence = new DraftPersistence(store, {
    read: () =>
      new Promise((resolve) => {
        restore = resolve;
      }),
    write,
  });
  const loading = persistence.load();
  store.write(key, { mode: "PATCH", instruction: "new" });
  restore([record(1, { mode: "PATCH", instruction: "old" })]);
  await loading;
  await persistence.flush();
  expect(store.read(key, { instruction: "" }).instruction).toBe("new");
  expect(write.mock.calls[0][0]).toMatchObject({
    expectedRevision: 1,
    valueJson: JSON.stringify({ mode: "PATCH", instruction: "new" }),
  });
  persistence.dispose();
});
it("reports failure, retains the draft, and persists it on explicit retry", async () => {
  const store = new DraftStore();
  const write = vi
    .fn()
    .mockRejectedValueOnce(new Error("저장 실패"))
    .mockResolvedValueOnce(record(1, { mode: "PATCH", instruction: "keep" }));
  const persistence = new DraftPersistence(store, {
    read: async () => [],
    write,
  });
  await persistence.load();
  store.write(key, { mode: "PATCH", instruction: "keep" });
  await expect(persistence.flush()).rejects.toThrow();
  expect(persistence.status()).toContain("실패");
  expect(store.read(key, { instruction: "" }).instruction).toBe("keep");
  await persistence.flush();
  expect(persistence.status()).toContain("저장됨");
  persistence.dispose();
});

it("drains edits arriving during an in-flight flush before reporting saved", async () => {
  const store = new DraftStore();
  let finish: (value: DraftRecord) => void = () => {};
  const write = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementationOnce(async () =>
      record(2, { mode: "PATCH", instruction: "second" }),
    );
  const persistence = new DraftPersistence(store, {
    read: async () => [],
    write,
  });
  await persistence.load();
  store.write(key, { mode: "PATCH", instruction: "first" });
  const saving = persistence.flush();
  await Promise.resolve();
  store.write(key, { mode: "PATCH", instruction: "second" });
  finish(record(1, { mode: "PATCH", instruction: "first" }));
  await saving;
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1][0].valueJson).toContain("second");
  persistence.dispose();
});
