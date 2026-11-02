import { resolveModel } from "../connection/provider";
import { reviewCommand } from "./api";
import type { SelectedTarget } from "./selection-targets";
import type {
  SelectedPrepared,
  SelectedRequestDraft,
} from "./useSelectedRequest";

export async function prepareSelectionRequest(
  target: SelectedTarget,
  draft: SelectedRequestDraft,
): Promise<SelectedPrepared> {
  const model = await resolveModel();
  const common = {
    model,
    documentId: target.documentId,
    expectedHeadId: target.expectedHeadId,
    operationId: crypto.randomUUID(),
    instruction: draft.instruction,
    retryOf: null,
  };
  if (target.kind === "candidate")
    return prepareCandidate(target, draft, common);
  const selectionTarget =
    target.kind === "confirmed"
      ? { kind: "confirmed" as const, value: target.selection }
      : {
          kind: "rewrite" as const,
          value: {
            batchId: target.batchId,
            candidateHash: await contentHash(target.candidate),
            selection: target.selection,
          },
        };
  return {
    kind: "selection",
    value: await reviewCommand(
      {
        kind: "prepare_selection",
        request: {
          ...common,
          taskId: target.selection.taskId,
          target: selectionTarget,
          commentIds: [],
          contextHash: null,
        },
      },
      "prepared_selection",
    ),
  };
}
async function contentHash(content: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(content),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function prepareCandidate(
  target: Extract<SelectedTarget, { kind: "candidate" }>,
  draft: SelectedRequestDraft,
  common: Omit<
    import("../generated/RegenerateRequest").RegenerateRequest,
    "batchId" | "proposalId" | "expectedRevision"
  >,
): Promise<SelectedPrepared> {
  return {
    kind: "regenerate",
    value: await reviewCommand(
      {
        kind: "prepare_regeneration",
        request: {
          ...common,
          batchId: target.batchId,
          proposalId: target.proposalId,
          expectedRevision: target.expectedRevision,
          options: {
            target: { kind: "candidate_selection", value: target.selection },
            commentIds: draft.commentIds,
            contextHash: null,
          },
        },
      },
      "prepared_regeneration",
    ),
  };
}
