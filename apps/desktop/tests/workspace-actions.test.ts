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
  await actions.remove(documents[0]);
  expect(options.flush.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(workspaceSnapshot).mock.invocationCallOrder[0],
  );
  expect(options.list.ids).toEqual([first]);
  expect(options.setEditor).toHaveBeenCalledWith({ document: { id: second } });
  expect(options.setSnapshot).toHaveBeenCalledWith(snapshot);
  expect(options.setRemoved).toHaveBeenCalledWith(documents[0]);
});

it("a failed restore preserves the completed document and current input", async () => {
  const { options, actions } = setup(second);
  options.list.remove(first);
  options.flush.mockRejectedValueOnce(new Error("원문 저장 실패"));
  await actions.navigate(first);
  expect(options.list.ids).toEqual([first]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setSnapshot).not.toHaveBeenCalled();
  expect(editorCommand).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith("원문 저장 실패");
  await actions.navigate(first);
  expect(options.list.ids).toEqual([]);
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
  options.list.remove(first);
  blocked = true;
  await actions.navigate(first);
  expect(options.list.ids).toEqual([first]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setSnapshot).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith(
    expect.stringContaining("목록 설정을 저장하지 못했습니다"),
  );
  blocked = false;
  await actions.navigate(first);
  expect(options.list.ids).toEqual([]);
});
it("a failed save preserves the document, list and input and permits retry", async () => {
  const { options, actions } = setup();
  options.flush.mockRejectedValueOnce(new Error("저장 실패"));
  await actions.remove(documents[0]);
  expect(options.list.ids).toEqual([]);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(options.setSnapshot).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenCalledWith("저장 실패");
  expect(options.lock.current).toBe(false);
  await actions.remove(documents[0]);
  expect(options.list.ids).toEqual([first]);
});
it("does not unmount the current editor when removing an inactive document", async () => {
  const { options, actions } = setup();
  await actions.remove(documents[1]);
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
  const pending = actions.remove(documents[0]);
  await actions.remove(documents[1]);
  await actions.navigate(second);
  expect(options.flush).toHaveBeenCalledTimes(1);
  finish();
  await pending;
  expect(options.list.ids).toEqual([first]);
});
it("reopening restores the same document and removing the last one opens the empty state", async () => {
  const { options, actions } = setup();
  vi.mocked(workspaceSnapshot).mockResolvedValueOnce({
    ...snapshot,
    documents: [documents[0]],
  });
  await actions.remove(documents[0]);
  expect(options.setEditor).toHaveBeenLastCalledWith(null);
  await actions.navigate(first);
  expect(options.list.ids).toEqual([]);
  expect(editorCommand).toHaveBeenLastCalledWith(
    { kind: "select_document", documentId: first },
    "state",
  );
});
