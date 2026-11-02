import type { GenerationAttempt } from "../../src/generated/GenerationAttempt";
import type { SelectedTarget } from "../../src/review/selection-targets";

export function failedSelectionRequest(
  target: SelectedTarget,
): GenerationAttempt["request"] {
  const common = requestBase(target);
  if (target.kind === "candidate")
    return {
      kind: "regenerate",
      value: {
        ...common,
        batchId: target.batchId,
        proposalId: target.proposalId,
        expectedRevision: target.expectedRevision,
        options: {
          target: { kind: "candidate_selection", value: target.selection },
          commentIds: [],
          contextHash: null,
        },
      },
    };
  return {
    kind: "selection",
    value: {
      ...common,
      taskId: target.selection.taskId,
      commentIds: [],
      contextHash: null,
      target:
        target.kind === "confirmed"
          ? { kind: "confirmed", value: target.selection }
          : {
              kind: "rewrite",
              value: {
                batchId: target.batchId,
                candidateHash: "hash",
                selection: target.selection,
              },
            },
    },
  };
}
function requestBase(target: SelectedTarget) {
  return {
    documentId: target.documentId,
    expectedHeadId: target.expectedHeadId,
    instruction: "A 요청",
    operationId: "operation1",
    retryOf: null,
    model: {
      provider: "codex" as const,
      model: "fixture",
      effort: "low" as const,
    },
  };
}
