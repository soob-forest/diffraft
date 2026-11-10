import type { BatchSummary } from "../generated/BatchSummary";
import { reviewCommand } from "./api";

export async function readReviewProjection(
  batch: BatchSummary,
  documentId: string,
  headId: string,
  generating: boolean,
) {
  if (
    documentId &&
    batch.mode === "PATCH" &&
    batch.status === "ACTIVE" &&
    !generating
  ) {
    await reviewCommand(
      {
        kind: "prepare_patch_review",
        request: {
          documentId,
          batchId: batch.id,
          expectedHeadId: headId,
          operationId: crypto.randomUUID(),
        },
      },
      "batch",
    );
  }
  return reviewCommand(
    { kind: "projection", batchId: batch.id, expectedHeadId: headId },
    "projection",
  );
}
