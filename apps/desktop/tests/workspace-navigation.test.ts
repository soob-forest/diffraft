import { afterEach, expect, it, vi } from "vitest";
import { editorCommand } from "../src/editor/api";
import { workspaceNavigation } from "../src/editor/workspace-navigation";

vi.mock("../src/editor/api", () => ({
  editorCommand: vi.fn(async () => null),
}));
afterEach(() => vi.clearAllMocks());
function navigation(flush: () => Promise<void>) {
  const state = {
    model: {
      autosave: { flush: vi.fn(async () => {}) },
      state: { document: { id: "doc" } },
      setError: vi.fn(),
    },
    taskFlush: { current: null },
    setTaskId: vi.fn(),
    entry: { clearResult: vi.fn(), show: vi.fn(), openResult: vi.fn() },
    sourceRequest: {
      selection: { draft: { flush } },
      run: (action: () => Promise<void>) => action(),
      close: vi.fn(),
    },
  };
  return { state, actions: workspaceNavigation(state as never) };
}
const result = {
  batchId: "batch",
  proposalId: "proposal",
  revision: 1,
  status: "PENDING",
};
it("persists the source draft before changing task and opens the current result", async () => {
  const flush = vi.fn(async () => {}),
    { state, actions } = navigation(flush);
  await actions.openSourceOverlap("other", result);
  expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(editorCommand).mock.invocationCallOrder[0],
  );
  expect(state.setTaskId).toHaveBeenCalledWith("other");
  expect(state.entry.openResult).toHaveBeenCalledWith({
    ...result,
    current: true,
    created: false,
  });
});
it("keeps the source composer open when its durable draft write fails", async () => {
  const { state, actions } = navigation(async () => {
    throw new Error("저장 실패");
  });
  await expect(actions.openSourceOverlap("other", result)).rejects.toThrow(
    "저장 실패",
  );
  expect(editorCommand).not.toHaveBeenCalled();
  expect(state.setTaskId).not.toHaveBeenCalled();
  expect(state.sourceRequest.close).not.toHaveBeenCalled();
  expect(state.entry.openResult).not.toHaveBeenCalled();
});
