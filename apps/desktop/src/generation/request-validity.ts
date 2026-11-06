import type { PendingRequest } from "./request";
export function pendingReviewChanged(
  pending: PendingRequest,
  sequence: number,
  active: string | null,
) {
  return (
    sequence >= (pending.reviewSequence ?? 0) &&
    (sequence > (pending.reviewSequence ?? sequence) ||
      pending.request.expectedActiveBatchId !== active)
  );
}
