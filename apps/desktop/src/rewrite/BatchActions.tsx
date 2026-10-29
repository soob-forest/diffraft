import type { DocumentModel } from "../editor/useDocument";
import type { ReviewBatch } from "../generated/ReviewBatch";
import type { ReviewModel } from "../review/useReview";
import { BatchDecisionDialog } from "./BatchDecisionDialog";
import { useBatchDecision } from "./useBatchDecision";

export function BatchActions({
  model,
  review,
  blocked,
}: {
  model: DocumentModel;
  review: ReviewModel;
  blocked: boolean;
}) {
  const actions = useBatchDecision(model, review, blocked);
  const batch = review.projection?.batch;
  if (!batch) return null;
  const rewrite = batch.mode === "REWRITE";
  const current = batch.baseVersionId === review.projection?.currentHeadId;
  const pending = batch.status === "ACTIVE" || batch.status === "ARCHIVED";
  return (
    <div className="group-bar">
      {rewrite && (
        <span>전체 재작성 · {status[batch.status] ?? batch.status}</span>
      )}
      {rewrite && !current && (
        <span role="status">
          기준본이 바뀌었습니다. 최신 확정본에서 다시 요청해 주세요.
        </span>
      )}
      <RewriteButtons batch={batch} current={current} actions={actions} />
      {pending && (
        <button
          type="button"
          disabled={actions.blocked}
          onClick={() => actions.confirm("discard")}
        >
          제안 취소
        </button>
      )}
      {actions.message && <p role="status">{actions.message}</p>}
      {actions.confirmation && (
        <BatchDecisionDialog actions={actions} version={model.status.version} />
      )}
    </div>
  );
}
const status: Record<string, string> = {
  ACTIVE: "미반영 후보",
  ARCHIVED: "이전 후보",
  APPLIED: "적용 완료",
  DISCARDED: "취소됨 · 기록 전용",
};

function RewriteButtons({
  batch,
  current,
  actions,
}: {
  batch: ReviewBatch;
  current: boolean;
  actions: ReturnType<typeof useBatchDecision>;
}) {
  const rewrite = batch.mode === "REWRITE";
  return (
    <>
      {rewrite && batch.status === "ACTIVE" && (
        <button
          type="button"
          disabled={actions.blocked || !current}
          className="primary"
          onClick={() => actions.confirm("apply_rewrite")}
        >
          이 재작성안 적용
        </button>
      )}
      {rewrite && batch.status === "ARCHIVED" && (
        <button
          type="button"
          disabled={actions.blocked || !current}
          onClick={() => actions.confirm("select_rewrite")}
        >
          이전 안 선택
        </button>
      )}
    </>
  );
}
