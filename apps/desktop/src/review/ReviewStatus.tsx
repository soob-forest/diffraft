import { useEffect, useRef } from "react";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { VersionSummary } from "../generated/VersionSummary";
import { invalidationReason } from "./invalidation";
import { reviewPresentation } from "./presentation";
import type { ReviewModel } from "./useReview";

export function ReviewStatus({
  projection,
  review,
  onPreview,
  onRequest,
  versions,
}: {
  projection: ReviewProjection;
  review: ReviewModel;
  onPreview: () => void;
  onRequest: () => void;
  versions: VersionSummary[];
}) {
  const state = reviewPresentation(projection, review.state.generating);
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(state.kind);
  useEffect(() => {
    if (previous.current === "pending" && state.kind !== "pending")
      root.current?.focus();
    previous.current = state.kind;
  }, [state.kind]);
  if (state.kind === "pending") return null;
  const current = review.state.batches.find(
    (b) => b.status === "ACTIVE" && b.id !== projection.batch.id,
  );
  return (
    <div className="review-message" role="status" tabIndex={-1} ref={root}>
      <strong>{state.title}</strong>
      <p>{description(state, projection, versions)}</p>
      {(state.accepted > 0 || state.rejected > 0) && (
        <p>
          승인 {state.accepted}개 · 거절 {state.rejected}개
        </p>
      )}
      <button type="button" onClick={onPreview}>
        확정본 보기
      </button>
      {(state.kind === "stale" || state.kind === "conflict") && (
        <button type="button" onClick={onRequest}>
          최신 원문에서 요청 준비
        </button>
      )}
      {current && (
        <button type="button" onClick={() => review.setBatchId(current.id)}>
          현재 검토로 돌아가기
        </button>
      )}
    </div>
  );
}

function description(
  state: ReturnType<typeof reviewPresentation>,
  projection: ReviewProjection,
  versions: VersionSummary[],
) {
  const reason =
    state.kind === "stale" ? invalidationReason(projection, versions) : null;
  return reason ? `${reason} ${state.description}` : state.description;
}
