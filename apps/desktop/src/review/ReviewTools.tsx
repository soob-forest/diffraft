import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { reviewPresentation } from "./presentation";
import { ReviewHeader } from "./ReviewContent";
import type { Panel } from "./useReviewPanel";

export function ReviewPrimary({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <>
      <strong>
        {reviewPresentation(projection).kind === "pending"
          ? `변경 검토 · 남은 ${projection.groups.length}개`
          : reviewPresentation(projection).title}
      </strong>
      <details className="review-history-menu">
        <summary>
          제안 기록{" "}
          <span className="diff-stats" data-testid="diff-stats">
            +{projection.stats.addedLines} / −{projection.stats.removedLines}
          </span>
        </summary>
        <ReviewHeader
          review={{
            ...panel.review,
            setBatchId: (id) => {
              panel.history.close();
              panel.review.setBatchId(id);
            },
          }}
        />
      </details>
      <button
        className="bulk-approval"
        type="button"
        disabled={panel.blocked || !projection.groups.length}
        onClick={panel.confirm}
      >
        남은 제안 전체 승인
      </button>
    </>
  );
}

export function CommentSelection({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  const index = projection.groups.findIndex(
    (group) => group.id === panel.selected?.id,
  );
  const proposal = projection.batch.proposals.find(
    (value) => value.id === panel.selected?.proposals[0]?.id,
  );
  return (
    <div className="comment-selection">
      선택한 변경 · {index + 1} / {projection.groups.length} ·{" "}
      {proposal?.operation.headingPath.at(-1) || "문서"}
    </div>
  );
}

export function ReviewMessage({ panel }: { panel: Panel }) {
  const message = panel.review.error || panel.actions.message;
  return message ? (
    <p role="status" className="review-message">
      {message}
    </p>
  ) : null;
}

import type { ConversationResult } from "../generated/ConversationResult";
import { currentResultGroup } from "./result-destination";

export function useReviewEntry(
  props: {
    requestedResult: ConversationResult | null;
    rewriteRequest: number;
    selectedDraftRequest: number;
  },
  panel: Panel,
  showDetail: (() => void) | undefined,
) {
  const chooseBatch = panel.review.setBatchId;
  const handled = useRef<ConversationResult | null>(null);
  useLayoutEffect(() => {
    if (props.requestedResult) chooseBatch(props.requestedResult.batchId);
  }, [props.requestedResult, chooseBatch]);
  useLayoutEffect(() => {
    const result = props.requestedResult,
      projection = panel.review.projection;
    if (!result || handled.current === result || !projection) return;
    const group = currentResultGroup(projection, result);
    if (!group) return;
    handled.current = result;
    panel.history.close();
    panel.choose(group);
    showDetail?.();
  }, [props.requestedResult, panel, showDetail]);
  useEffect(() => {
    if (props.rewriteRequest) showDetail?.();
  }, [props.rewriteRequest, showDetail]);
  const activateDraft = panel.selectedRequest.setActive;
  useEffect(() => {
    if (props.selectedDraftRequest) {
      activateDraft(true);
      showDetail?.();
    }
  }, [props.selectedDraftRequest, activateDraft, showDetail]);
}
