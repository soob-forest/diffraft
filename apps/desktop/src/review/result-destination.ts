import type { ConversationResult } from "../generated/ConversationResult";
import type { ReviewProjection } from "../generated/ReviewProjection";

export function currentResult(result: ConversationResult, created = false) {
  return { ...result, current: true as const, created };
}
export function isNewResult(result: ConversationResult | null | undefined) {
  return (
    isCurrentResult(result) &&
    result &&
    "created" in result &&
    result.created === true
  );
}
export function isCurrentResult(
  result: (ConversationResult & { current?: boolean }) | null | undefined,
) {
  return Boolean(result && "current" in result && result.current === true);
}
export function currentResultGroup(
  projection: ReviewProjection,
  result: ConversationResult,
) {
  if (
    !isCurrentResult(result) ||
    projection.batch.id !== result.batchId ||
    projection.batch.status !== "ACTIVE"
  )
    return undefined;
  return projection.groups.find((group) =>
    result.proposalId
      ? group.proposals.some(
          (proposal) =>
            proposal.id === result.proposalId &&
            proposal.revision === result.revision,
        )
      : true,
  );
}
