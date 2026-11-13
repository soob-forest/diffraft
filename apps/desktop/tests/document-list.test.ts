import { expect, it } from "vitest";
import {
  completedDocuments,
  DocumentList,
  visibleWorkspace,
} from "../src/document-list";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (_key: string, next: string) => {
      values.set(_key, next);
    },
  };
}
const snapshot = {
  schemaVersion: 1,
  sequence: 0,
  selectedDocumentId: first,
  documents: [first, second].map((id) => ({
    id,
    title: id,
    headVersion: 1,
    contentHash: "hash",
  })),
};

it("keeps completed documents out of the list after restart and restores the same ID", () => {
  const disk = storage(),
    list = new DocumentList(disk);
  list.load();
  list.complete(first);
  const reopened = new DocumentList(disk);
  reopened.load();
  expect(
    visibleWorkspace(snapshot, reopened.completedIds).documents.map(
      (doc) => doc.id,
    ),
  ).toEqual([second]);
  expect(
    visibleWorkspace(snapshot, reopened.completedIds).selectedDocumentId,
  ).toBe(second);
  expect(completedDocuments(snapshot, reopened.completedIds)).toEqual([
    snapshot.documents[0],
  ]);
  reopened.restore(first);
  expect(visibleWorkspace(snapshot, reopened.completedIds)).toEqual(snapshot);
  expect(completedDocuments(snapshot, reopened.completedIds)).toEqual([]);
});

it("does not change in-memory visibility when storage fails", () => {
  const list = new DocumentList({
    getItem: () => null,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  });
  list.load();
  expect(() => list.complete(first)).toThrow(/목록.*저장/);
  expect(list.completedIds).toEqual([]);
});

it.each(["{", '["invalid"]', "{}", "[null]"])(
  "rejects malformed list settings without overwriting them: %s",
  (value) => {
    const list = new DocumentList({
      getItem: () => value,
      setItem: () => {
        throw new Error("must not write");
      },
    });
    expect(() => list.load()).toThrow(/목록/);
  },
);

it("normalizes duplicates and handles removal of the last document", () => {
  const list = new DocumentList(storage());
  list.load();
  list.complete(first);
  list.complete(first);
  list.complete(second);
  expect(list.completedIds).toEqual([first, second]);
  expect(visibleWorkspace(snapshot, list.completedIds)).toMatchObject({
    documents: [],
    selectedDocumentId: null,
  });
});

it("forgets completed documents atomically and restores them only on explicit reopen", () => {
  const disk = storage();
  const list = new DocumentList(disk);
  list.complete(first);
  list.forget(first);
  const restarted = new DocumentList(disk);
  restarted.load();
  expect(restarted.completedIds).toEqual([]);
  expect(restarted.removedIds).toEqual([first]);
  expect(completedDocuments(snapshot, restarted.completedIds)).toEqual([]);
  expect(visibleWorkspace(snapshot, restarted.hiddenIds).documents).toEqual([
    snapshot.documents[1],
  ]);
  restarted.restore(first);
  expect(visibleWorkspace(snapshot, restarted.hiddenIds)).toEqual(snapshot);
});
it("migrates legacy completion preferences without writing during load", () => {
  const disk = storage();
  disk.setItem(
    "docreview.completed-documents.v1",
    JSON.stringify([first, first]),
  );
  const list = new DocumentList(disk);
  list.load();
  expect(list.completedIds).toEqual([first]);
  expect(disk.getItem("docreview.document-list.v2")).toBeNull();
  list.forget(first);
  const next = new DocumentList(disk);
  next.load();
  expect(next.completedIds).toEqual([]);
  expect(next.removedIds).toEqual([first]);
});
it("preserves completed state when forgetting fails and rejects active targets", () => {
  let blocked = false;
  const list = new DocumentList({
    getItem: () => null,
    setItem: () => {
      if (blocked) throw new DOMException("full", "QuotaExceededError");
    },
  });
  expect(() => list.forget(first)).toThrow(/완료/);
  list.complete(first);
  blocked = true;
  expect(() => list.forget(first)).toThrow(/저장/);
  expect(list.completedIds).toEqual([first]);
  expect(list.removedIds).toEqual([]);
});
it("normalizes overlapping v2 states with removed taking precedence", () => {
  const disk = storage();
  disk.setItem(
    "docreview.document-list.v2",
    JSON.stringify({
      completedIds: [first, second],
      removedIds: [first, first],
    }),
  );
  const list = new DocumentList(disk);
  list.load();
  expect(list.completedIds).toEqual([second]);
  expect(list.removedIds).toEqual([first]);
});

it("retries a failed initial read before changing preferences and preserves hidden IDs", () => {
  const disk = storage();
  const initial = { completedIds: [first], removedIds: [second] };
  disk.setItem("docreview.document-list.v2", JSON.stringify(initial));
  let blocked = true;
  const list = new DocumentList({
    ...disk,
    getItem: (key) => {
      if (blocked) throw new DOMException("blocked", "SecurityError");
      return disk.getItem(key);
    },
  });
  expect(() => list.load()).toThrow(/읽/);
  const third = "00000000-0000-4000-8000-000000000003";
  expect(() => list.complete(third)).toThrow(/읽/);
  expect(disk.getItem("docreview.document-list.v2")).toBe(
    JSON.stringify(initial),
  );
  blocked = false;
  list.complete(third);
  expect(list.completedIds).toEqual([first, third]);
  expect(list.removedIds).toEqual([second]);
});

it.each(["complete", "forget", "restore"] as const)(
  "does not overwrite invalid settings during %s",
  (action) => {
    const disk = storage();
    disk.setItem("docreview.document-list.v2", "{");
    const list = new DocumentList(disk);
    expect(() => list.load()).toThrow(/형식/);
    expect(() => list[action](first)).toThrow(/형식/);
    expect(disk.getItem("docreview.document-list.v2")).toBe("{");
  },
);
