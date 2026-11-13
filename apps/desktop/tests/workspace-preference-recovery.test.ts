import { beforeEach, expect, it, vi } from "vitest";
import { DocumentList } from "../src/document-list";
import { editorCommand, pickDocument } from "../src/editor/api";
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
  vi.mocked(editorCommand).mockImplementation(
    async (action) =>
      ({
        document: { id: "documentId" in action ? action.documentId : second },
      }) as never,
  );
  vi.mocked(pickDocument).mockResolvedValue({ id: second } as never);
});
function setup() {
  const storage = { getItem: vi.fn(() => "{"), setItem: vi.fn() };
  const options = {
    currentId: first,
    lock: { current: false },
    list: new DocumentList(storage),
    flush: vi.fn(async () => {}),
    setBusy: vi.fn(),
    setError: vi.fn(),
    setEditor: vi.fn(),
    setSnapshot: vi.fn(),
    setRemoved: vi.fn(),
  };
  return { storage, options, actions: workspaceActions(options) };
}

it.each([true, false, second])(
  "opens %s without overwriting unreadable preferences and keeps a warning",
  async (target) => {
    const { storage, options, actions } = setup();
    expect(() => options.list.load()).toThrow(/형식/);
    expect(await actions.navigate(target)).toBe(true);
    expect(editorCommand).toHaveBeenCalledWith(
      { kind: "select_document", documentId: second },
      "state",
    );
    expect(options.setEditor).toHaveBeenCalledWith({
      document: { id: second },
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(options.setError).toHaveBeenLastCalledWith(
      expect.stringMatching(/목록.*형식.*열었습니다/s),
    );
  },
);

it("does not claim a document was opened after cancelling the picker", async () => {
  const { storage, options, actions } = setup();
  vi.mocked(pickDocument).mockResolvedValueOnce(null);
  expect(await actions.navigate(false)).toBe(true);
  expect(options.setEditor).not.toHaveBeenCalled();
  expect(editorCommand).not.toHaveBeenCalled();
  expect(options.setError).toHaveBeenLastCalledWith(
    expect.stringMatching(/형식/),
  );
  expect(options.setError).not.toHaveBeenCalledWith(
    expect.stringMatching(/열었습니다/),
  );
  expect(storage.setItem).not.toHaveBeenCalled();
});

it.each(["complete", "forget"] as const)(
  "still blocks %s while preferences cannot be read",
  async (action) => {
    const { storage, options, actions } = setup();
    expect(await actions[action](documents[0])).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(options.setEditor).not.toHaveBeenCalled();
    expect(options.setError).toHaveBeenLastCalledWith(
      expect.stringMatching(/형식/),
    );
  },
);

it("permits navigation when preference reads are denied by storage", async () => {
  const { storage, options, actions } = setup();
  storage.getItem.mockImplementation(() => {
    throw new DOMException("denied", "SecurityError");
  });
  expect(await actions.navigate(second)).toBe(true);
  expect(options.setError).toHaveBeenLastCalledWith(
    expect.stringMatching(/읽을 수 없습니다.*열었습니다/s),
  );
  expect(storage.setItem).not.toHaveBeenCalled();
});

it.each(["complete", "forget"] as const)(
  "reconciles a hidden current document after settings recover during %s",
  async (action) => {
    const { storage, options, actions } = setup();
    expect(await actions.navigate(first)).toBe(true);
    storage.getItem.mockReturnValue(
      JSON.stringify({ completedIds: [first], removedIds: [] }),
    );
    expect(await actions[action](documents[0])).toBe(true);
    expect(options.setEditor).toHaveBeenLastCalledWith({
      document: { id: second },
    });
    expect(options.setError).toHaveBeenLastCalledWith("");
  },
);
