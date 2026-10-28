import type { BatchSummary } from "../generated/BatchSummary";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import type { TaskConversation } from "../generated/TaskConversation";

export function mergeConversation(
  previous: TaskConversation | null,
  next: TaskConversation,
): TaskConversation {
  if (!previous || previous.taskId !== next.taskId) return next;
  const messages = new Map(
    previous.messages.map((message) => [message.id, message]),
  );
  for (const message of next.messages) messages.set(message.id, message);
  const keepsEarlier =
    (previous.messages[0]?.sequence ?? Infinity) <
    (next.messages[0]?.sequence ?? Infinity);
  return {
    ...next,
    messages: [...messages.values()].sort((a, b) => a.sequence - b.sequence),
    earlierBefore: keepsEarlier ? previous.earlierBefore : next.earlierBefore,
  };
}

export function retryRequest(
  attempt: GenerationAttempt,
  head: string,
  operationId: string,
  batches: BatchSummary[],
): SavedGenerationRequest {
  if (!["FAILED", "CANCELLED"].includes(attempt.status))
    throw new Error("실패하거나 중단한 요청만 다시 실행할 수 있습니다.");
  if (attempt.request.value.expectedHeadId !== head)
    throw new Error(
      "문서가 변경되었습니다. 최신 범위에서 새 요청을 작성해 주세요.",
    );
  const retry = { operationId, retryOf: attempt.jobId };
  const saved = attempt.request;
  const expectedActiveBatchId = retryBatch(saved, batches);
  if (saved.kind === "generate")
    return {
      kind: "generate",
      value: { ...saved.value, ...retry, expectedActiveBatchId },
    };
  if (saved.kind === "regenerate")
    return { kind: "regenerate", value: { ...saved.value, ...retry } };
  return {
    kind: "rewrite",
    value: { ...saved.value, ...retry, expectedActiveBatchId },
  };
}

function retryBatch(saved: SavedGenerationRequest, batches: BatchSummary[]) {
  if (saved.kind === "regenerate") return null;
  const expected = saved.value.expectedActiveBatchId;
  const active = batches.find((batch) => batch.status === "ACTIVE")?.id ?? null;
  if (expected === active) return active;
  const previous = batches.find((batch) => batch.id === expected);
  if (
    saved.kind === "rewrite" &&
    saved.value.archivePatch &&
    !active &&
    previous?.mode === "PATCH" &&
    previous.status === "ARCHIVED"
  )
    return null;
  throw new Error(
    "현재 제안이 변경되었습니다. 제안을 확인한 뒤 새 요청을 작성해 주세요.",
  );
}
