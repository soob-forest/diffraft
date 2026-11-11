import { expect, it } from "vitest";
import {
  completedDocuments,
  DocumentList,
  visibleWorkspace,
} from "../src/document-list";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
function storage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
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
  list.remove(first);
  const reopened = new DocumentList(disk);
  reopened.load();
  expect(
    visibleWorkspace(snapshot, reopened.ids).documents.map((doc) => doc.id),
  ).toEqual([second]);
  expect(visibleWorkspace(snapshot, reopened.ids).selectedDocumentId).toBe(
    second,
  );
  expect(completedDocuments(snapshot, reopened.ids)).toEqual([
    snapshot.documents[0],
  ]);
  reopened.restore(first);
  expect(visibleWorkspace(snapshot, reopened.ids)).toEqual(snapshot);
  expect(completedDocuments(snapshot, reopened.ids)).toEqual([]);
});

it("does not change in-memory visibility when storage fails", () => {
  const list = new DocumentList({
    getItem: () => null,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  });
  list.load();
  expect(() => list.remove(first)).toThrow(/목록.*저장/);
  expect(list.ids).toEqual([]);
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
  list.remove(first);
  list.remove(first);
  list.remove(second);
  expect(list.ids).toEqual([first, second]);
  expect(visibleWorkspace(snapshot, list.ids)).toMatchObject({
    documents: [],
    selectedDocumentId: null,
  });
});
