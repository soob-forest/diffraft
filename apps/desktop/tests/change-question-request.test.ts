import { expect, it, vi } from "vitest";
import type { ChangeQuestion } from "../src/generated/ChangeQuestion";
import { prepareRequest } from "../src/generation/request";

const calls = vi.hoisted(() => ({
  actions: [] as unknown[],
  question: null as unknown as ChangeQuestion,
}));
vi.mock("../src/connection/provider", () => ({
  resolveModel: async () => ({ provider: "claude", model: "opus" }),
}));
vi.mock("../src/editor/api", () => ({
  editorCommand: async () => ({
    documentId: "doc",
    versionId: "head",
    version: 1,
    contentHash: "hash",
    text: "현재 확정본",
    from: 0,
    to: 6,
    blocks: [],
  }),
}));
vi.mock("../src/review/api", () => ({
  reviewCommand: async (action: { kind: string }) => {
    calls.actions.push(action);
    return action.kind === "state"
      ? { generating: false, batches: [{ id: "batch", status: "ACTIVE" }] }
      : calls.question;
  },
}));
it("revalidates only the typed identity, pins the exact question and excludes unrelated source", async () => {
  const question: ChangeQuestion = {
    documentId: "doc",
    taskId: "task",
    batchId: "batch",
    baseVersionId: "base",
    subject: { kind: "unit", id: "unit", revision: 2 },
    label: "변경 2",
    changes: [{ id: "change", before: "전", after: "후" }],
    contentHash: "hash",
  };
  calls.question = question;
  const pending = await prepareRequest(
    {
      taskId: "task",
      taskFlush: { current: null },
      model: {
        state: { document: { id: "doc" } },
        gate: { run: (action: () => unknown) => action() },
        autosave: {
          flush: async () => {},
          document: { id: "doc", versionId: "head", content: "현재 확정본" },
        },
      },
      scope: {
        value: () => {
          throw new Error("원문 대상이면 실패");
        },
      },
    } as never,
    "EXPLAIN",
    "이유는?",
    { question },
  );
  expect(calls.actions.at(-1)).toEqual({
    kind: "prepare_question",
    request: {
      documentId: "doc",
      taskId: "task",
      batchId: "batch",
      expectedHeadId: "head",
      subject: question.subject,
    },
  });
  expect(pending.request.question).toEqual(question);
  expect(pending.scope.text).toBe("");
  expect(pending.request.archivePrevious).toBe(false);
});
