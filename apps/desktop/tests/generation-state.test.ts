import { expect, it } from "vitest";
import { selectedRange, selectionForEpoch } from "../src/editor/request-scope";
import type { GenerationAttempt } from "../src/generated/GenerationAttempt";
import type { ReviewBatch } from "../src/generated/ReviewBatch";
import type { TaskConversation } from "../src/generated/TaskConversation";
import { mergeConversation, retryRequest } from "../src/generation/state";

const attempt: GenerationAttempt = {
  jobId: "failed-job",
  attemptId: "attempt",
  status: "FAILED",
  errorCode: "SESSION_MISSING",
  request: {
    kind: "rewrite",
    value: {
      model: "opus",
      documentId: "document",
      taskId: "task",
      expectedHeadId: "head",
      expectedActiveBatchId: "patch",
      referenceBatchId: null,
      archivePatch: true,
      instruction: "다른 방향",
      operationId: "original",
      retryOf: null,
    },
  },
};
const archived: ReviewBatch = {
  id: "patch",
  taskId: "task",
  documentId: "document",
  baseVersionId: "head",
  applyHeadId: "head",
  status: "ARCHIVED",
  mode: "PATCH",
  summary: "이전 제안",
  candidateMarkdown: null,
  proposals: [],
};
function page(
  sequences: number[],
  earlierBefore: number | null,
): TaskConversation {
  return {
    taskId: "task",
    earlierBefore,
    session: "CONNECTED",
    lastAttempt: null,
    commonRules: "",
    messages: sequences.map((sequence) => ({
      id: `message-${sequence}`,
      sequence,
      role: "USER",
      content: `요청 ${sequence}`,
      createdAt: 100 - sequence,
      jobId: null,
    })),
  };
}

it("retries a failed rewrite after its confirmed PATCH was archived at request start", () => {
  const result = retryRequest(attempt, "head", "new-operation", [archived]);
  expect(result.value).toMatchObject({
    expectedActiveBatchId: null,
    retryOf: "failed-job",
    model: "opus",
    operationId: "new-operation",
  });
  expect(attempt.request.value.operationId).toBe("original");
});
it("does not silently archive a replacement candidate or replay changed heads", () => {
  const replacement = { ...archived, id: "replacement", status: "ACTIVE" };
  expect(() =>
    retryRequest(attempt, "head", "new", [archived, replacement]),
  ).toThrow(/제안/);
  expect(() => retryRequest(attempt, "new-head", "new", [archived])).toThrow(
    /문서/,
  );
  expect(() =>
    retryRequest({ ...attempt, status: "SUCCEEDED" }, "head", "new", [
      archived,
    ]),
  ).toThrow(/실패/);
});
it("merges overlapping pages by sequence and retains the oldest pagination cursor", () => {
  const merged = mergeConversation(page([1, 2, 3], null), page([3, 4, 5], 3));
  expect(merged.messages.map((message) => message.sequence)).toEqual([
    1, 2, 3, 4, 5,
  ]);
  expect(merged.earlierBefore).toBeNull();
  expect(
    mergeConversation(merged, { ...page([9], null), taskId: "other" }).messages,
  ).toHaveLength(1);
});
it("never widens an empty selection into the whole document", () => {
  expect(() =>
    selectedRange("selection", { from: 2, to: 2, cursor: 2 }),
  ).toThrow(/선택/);
  expect(selectedRange("section", { from: 1, to: 3, cursor: 3 })).toEqual({
    kind: "section",
    cursor: 3,
  });
  expect(selectedRange("selection", { from: 1, to: 3, cursor: 3 })).toEqual({
    kind: "selection",
    from: 1,
    to: 3,
  });
});

it("resets selection immediately when approval or restoration replaces the editor", () => {
  const stored = { epoch: 1, value: { from: 20, to: 40, cursor: 40 } };
  expect(selectionForEpoch(1, stored)).toEqual(stored.value);
  expect(selectionForEpoch(2, stored)).toEqual({ from: 0, to: 0, cursor: 0 });
  expect(() =>
    selectedRange("selection", selectionForEpoch(2, stored)),
  ).toThrow(/선택/);
});
