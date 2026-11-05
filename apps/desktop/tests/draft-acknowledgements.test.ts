import { expect, it, vi } from "vitest";
import { DraftPersistence } from "../src/drafts/persistence";
import { DraftStore } from "../src/drafts/store";
import type { DraftWrite } from "../src/generated/DraftWrite";
import { unitCommentFeedback } from "../src/review/unit-comment-feedback";

const key = '["unit-comment","document","task","batch","plan","unit"]';
const other = '["request","document","task"]';
const value = (text: string) => ({ version: 1, id: text, text });
const record = (request: DraftWrite) => ({
  ...request,
  revision: request.expectedRevision + 1,
  updatedAt: 1,
});

it("confirms the written snapshot rather than a newer edit during its response", async () => {
  const store = new DraftStore(),
    first = value("first"),
    second = value("second");
  let finish: () => void = () => {};
  const write = vi
    .fn()
    .mockImplementationOnce(
      (request: DraftWrite) =>
        new Promise((resolve) => {
          finish = () => resolve(record(request));
        }),
    )
    .mockRejectedValueOnce(new Error("second failed"));
  const persistence = new DraftPersistence(store, {
    read: async () => [],
    write,
  });
  try {
    await persistence.load();
    store.write(key, first);
    const saving = persistence.flush();
    await Promise.resolve();
    expect(persistence.storageState(key, first).kind).toBe("saving");
    store.write(key, second);
    finish();
    await expect(saving).rejects.toThrow("second failed");
    expect(persistence.storageState(key, first).kind).toBe("saved");
    expect(persistence.storageState(key, second).kind).toBe("failed");
  } finally {
    persistence.dispose();
  }
});

it("keeps a confirmed comment when a different key fails and does not confirm a skipped key", async () => {
  const store = new DraftStore(),
    comment = value("comment");
  const write = vi.fn(async (request: DraftWrite) => {
    if (request.key === other) throw new Error("other failed");
    return record(request);
  });
  const persistence = new DraftPersistence(store, {
    read: async () => [],
    write,
  });
  try {
    await persistence.load();
    store.write(key, comment);
    store.write(other, { mode: "PATCH", instruction: "other" });
    await expect(persistence.flush()).rejects.toThrow();
    expect(persistence.storageState(key, comment).kind).toBe("saved");
    store.write(key, value("new"));
    await expect(persistence.flush()).rejects.toThrow();
    expect(persistence.storageState(key, store.peek(key)).kind).toBe("pending");
  } finally {
    persistence.dispose();
  }
});

it("confirms restored values, leaves newer input pending, and never confirms locked data", async () => {
  const store = new DraftStore(),
    newer = value("newer");
  const persistence = new DraftPersistence(store, {
    read: async () => [
      {
        ...record({
          key,
          schemaVersion: 1,
          expectedRevision: 0,
          valueJson: JSON.stringify(value("restored")),
        }),
      },
    ],
    write: async (request) => record(request),
  });
  try {
    await persistence.load();
    const restored = store.peek(key);
    expect(persistence.storageState(key, restored).kind).toBe("saved");
    store.write(key, newer);
    expect(persistence.storageState(key, newer).kind).toBe("pending");
    store.block(key);
    await persistence.flush();
    expect(persistence.storageState(key, newer).kind).toBe("locked");
    expect(persistence.storageState(key, restored).kind).toBe("locked");
  } finally {
    persistence.dispose();
  }
});

it("does not treat unpersisted defaults as saved", async () => {
  const store = new DraftStore();
  const persistence = new DraftPersistence(store, {
    read: async () => [],
    write: async (request) => record(request),
  });
  try {
    await persistence.load();
    expect(persistence.storageState(key, undefined).kind).toBe("unknown");
    expect(
      persistence.storageState(key, store.read(key, value("default"))).kind,
    ).toBe("unknown");
  } finally {
    persistence.dispose();
  }
});

it("quarantines unsupported stored data without confirming its replacement default", async () => {
  const store = new DraftStore(),
    initial = value("replacement");
  const write = vi.fn(async (request: DraftWrite) => record(request));
  const persistence = new DraftPersistence(store, {
    read: async () => [
      record({
        key,
        schemaVersion: 99,
        expectedRevision: 0,
        valueJson: JSON.stringify(value("old")),
      }),
    ],
    write,
  });
  try {
    await persistence.load();
    expect(persistence.storageState(key, store.read(key, initial)).kind).toBe(
      "locked",
    );
    store.write(key, value("ignored"));
    await persistence.flush();
    expect(write).not.toHaveBeenCalled();
    expect(persistence.storageState(key, initial).kind).toBe("locked");
  } finally {
    persistence.dispose();
  }
});

it("offers retry for B when its debounce joined the in-flight A save that later failed", async () => {
  vi.useFakeTimers();
  const store = new DraftStore(),
    second = { ...value("second"), version: 1 as const };
  let rejectFirst: (reason: Error) => void = () => {};
  const write = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    )
    .mockImplementationOnce(async (request: DraftWrite) => record(request));
  const persistence = new DraftPersistence(store, {
    read: async () => [],
    write,
  });
  try {
    await persistence.load();
    store.write(key, value("first"));
    const saving = persistence.flush();
    await Promise.resolve();
    store.write(key, second);
    await vi.advanceTimersByTimeAsync(500);
    rejectFirst(new Error("first failed"));
    await expect(saving).rejects.toThrow("first failed");
    const storage = persistence.storageState(key, second);
    expect(storage.kind).toBe("pending");
    expect(
      unitCommentFeedback({
        value: second,
        storage,
        busy: false,
        stage: "draft",
        result: null,
      }).retryDraft,
    ).toBe(true);
    await persistence.flush();
    expect(persistence.storageState(key, second).kind).toBe("saved");
    expect(write).toHaveBeenCalledTimes(2);
    expect(store.peek(key)).toBe(second);
  } finally {
    persistence.dispose();
    vi.useRealTimers();
  }
});
