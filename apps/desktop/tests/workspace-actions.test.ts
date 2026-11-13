import { beforeEach, expect, it, vi } from "vitest";
import { DocumentList } from "../src/document-list";
import { editorCommand } from "../src/editor/api";
import { workspaceSnapshot } from "../src/ipc";
import { workspaceActions } from "../src/workspace-actions";

vi.mock("../src/editor/api", () => ({
  editorCommand: vi.fn(),
  pickDocument: vi.fn(),
}));
vi.mock("../src/ipc", async (original) => ({
  ...(await original<object>()),
  workspaceSnapshot: vi.fn(),
}));
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const documents = [first, second].map((id) => ({
  id,
  title: id,
  headVersion: 1,
  contentHash: "hash",
}));
const snapshot = {
  schemaVersion: 1,
  sequence: 0,
  selectedDocumentId: first,
  documents,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(workspaceSnapshot).mockResolvedValue(snapshot);
  vi.mocked(editorCommand).mockResolvedValue({
    document: { id: second },
  } as never);
});
function setup(currentId = first) {
  const options = {
    currentId,
    lock: { current: false },
    list: new DocumentList({ getItem: () => null, setItem: vi.fn() }),
    flush: vi.fn(async () => {}),
    setBusy: vi.fn(),
    setError: vi.fn(),
    setEditor: vi.fn(),
    setSnapshot: vi.fn(),
    setRemoved: vi.fn(),
  };
  return { options, actions: workspaceActions(options) };
}
it("saves before removing the active document and opens the next listed document", async () => {
  const { options, actions } = setup();
  await actions.complete(documents[0]);
  expect(options.flush.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(workspaceSnapshot).mock.invocationCallOrder[0],
  );
  expect(options.list.completedIds).toEqual([first]);
  expect(options.setEditor).toHaveBeenCalledWith({ document: { id: second } });
  expect(options.setSnapshot).toHaveBeenCalledWith(snapshot);
  expect(options.setRemoved).toHaveBeenCalledWith(documents[0]);
});

it("a failed restore preserves the completed document and current input", async () => {
  const { options, actions } = setup(second);
  options.list.complete(first);
  options.flush.mockRejectedValueOnce(new Error("원문 저장 실패"));
  await actions.navigate(first);
  expect(options.list.completedIds).toEqual([first]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setSnapshot).not.toHaveBeenCalled();
  expect(editorCommand).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith("원문 저장 실패");
  await actions.navigate(first);
  expect(options.list.completedIds).toEqual([]);
});

it("a failed list write keeps the restored document completed and leaves the current editor", async () => {
  const { options, actions } = setup(second);
  let blocked = false;
  options.list = new DocumentList({
    getItem: () => null,
    setItem: () => {
      if (blocked) throw new DOMException("full", "QuotaExceededError");
    },
  });
  options.list.complete(first);
  blocked = true;
  await actions.navigate(first);
  expect(options.list.completedIds).toEqual([first]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setSnapshot).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith(
    expect.stringContaining("목록 설정을 저장하지 못했습니다"),
  );
  expect(editorCommand).toHaveBeenLastCalledWith(
    { kind: "select_document", documentId: second },
    "state",
  );
  blocked = false;
  await actions.navigate(first);
  expect(options.list.completedIds).toEqual([]);
});
it("a failed save preserves the document, list and input and permits retry", async () => {
  const { options, actions } = setup();
  options.flush.mockRejectedValueOnce(new Error("저장 실패"));
  await actions.complete(documents[0]);
  expect(options.list.completedIds).toEqual([]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setSnapshot).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith("저장 실패");
  expect(options.lock.current).toBe(false);
  await actions.complete(documents[0]);
  expect(options.list.completedIds).toEqual([first]);
});
it("does not unmount the current editor when removing an inactive document", async () => {
  const { options, actions } = setup();
  await actions.complete(documents[1]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(editorCommand).not.toHaveBeenCalled();
});
it("shares the navigation lock, preventing duplicate removal while saving", async () => {
  const { options, actions } = setup();
  let finish = () => {};
  options.flush.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const pending = actions.complete(documents[0]);
  await actions.complete(documents[1]);
  await actions.navigate(second);
  expect(options.flush).toHaveBeenCalledTimes(1);
  finish();
  await pending;
  expect(options.list.completedIds).toEqual([first]);
});
it("reopening restores the same document and removing the last one opens the empty state", async () => {
  const { options, actions } = setup();
  vi.mocked(workspaceSnapshot).mockResolvedValueOnce({
    ...snapshot,
    documents: [documents[0]],
  });
  await actions.complete(documents[0]);
  expect(options.setEditor).toHaveBeenLastCalledWith(null);
  await actions.navigate(first);
  expect(options.list.completedIds).toEqual([]);
  expect(editorCommand).toHaveBeenLastCalledWith(
    { kind: "select_document", documentId: first },
    "state",
  );
});

it("flushes before forgetting and keeps the active editor and raw history", async () => {
  const { options, actions } = setup(second);
  options.list.complete(first);
  expect(await actions.forget(documents[0])).toBe(true);
  expect(options.flush).toHaveBeenCalledOnce();
  expect(options.list.completedIds).toEqual([]);
  expect(options.list.removedIds).toEqual([first]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setSnapshot).toHaveBeenCalledWith(snapshot);
  expect(options.setRemoved).toHaveBeenCalledWith(null);
});
it("failed saving blocks forgetting and allows retry", async () => {
  const { options, actions } = setup(second);
  options.list.complete(first);
  options.flush.mockRejectedValueOnce(new Error("저장 실패"));
  expect(await actions.forget(documents[0])).toBe(false);
  expect(options.list.completedIds).toEqual([first]);
  expect(options.list.removedIds).toEqual([]);
  expect(options.setSnapshot).not.toHaveBeenCalled();
  expect(await actions.forget(documents[0])).toBe(true);
});

it("restores the displayed selection when the post-selection snapshot fails", async () => {
  const { options, actions } = setup(second);
  vi.mocked(workspaceSnapshot).mockRejectedValueOnce(
    new Error("문서 목록 조회 실패"),
  );
  expect(await actions.navigate(first)).toBe(false);
  expect(editorCommand).toHaveBeenLastCalledWith(
    { kind: "select_document", documentId: second },
    "state",
  );
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith("문서 목록 조회 실패");
  expect(options.lock.current).toBe(false);
});

it("reports both failures when restoring the previous selection also fails", async () => {
  const { options, actions } = setup(second);
  vi.mocked(workspaceSnapshot).mockRejectedValueOnce(
    new Error("목록 조회 실패"),
  );
  vi.mocked(editorCommand)
    .mockResolvedValueOnce({ document: { id: first } } as never)
    .mockRejectedValueOnce(new Error("선택 저장 실패"));
  expect(await actions.navigate(first)).toBe(false);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith(
    expect.stringMatching(
      /목록 조회 실패.*선택.*복구.*선택 저장 실패.*다시 선택/,
    ),
  );
  expect(options.lock.current).toBe(false);
});

it("loads hidden IDs before choosing the next document on completion", async () => {
  const { options, actions } = setup();
  options.list = new DocumentList({
    getItem: () => JSON.stringify({ completedIds: [second], removedIds: [] }),
    setItem: vi.fn(),
  });
  expect(await actions.complete(documents[0])).toBe(true);
  expect(options.setEditor).toHaveBeenCalledWith(null);
  expect(editorCommand).not.toHaveBeenCalled();
});

it("uses the stored selection for recovery when no document is displayed", async () => {
  const { options } = setup();
  const { currentId: _currentId, ...withoutEditor } = options;
  vi.mocked(workspaceSnapshot)
    .mockResolvedValueOnce(snapshot)
    .mockRejectedValueOnce(new Error("목록 조회 실패"));
  expect(await workspaceActions(withoutEditor).navigate(second)).toBe(false);
  expect(editorCommand).toHaveBeenLastCalledWith(
    { kind: "select_document", documentId: first },
    "state",
  );
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith("목록 조회 실패");
});
