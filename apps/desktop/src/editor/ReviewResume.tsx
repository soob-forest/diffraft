import { reviewPresentation } from "../review/presentation";
import { useReview } from "../review/useReview";
import type { DocumentModel } from "./useDocument";

export function ReviewResume({
  model,
  taskId,
  resume,
}: {
  model: DocumentModel;
  taskId: string;
  resume: () => void;
}) {
  const review = useReview(taskId, model.autosave.document.versionId);
  const projection = review.projection;
  if (
    review.error ||
    review.loading ||
    !projection ||
    projection.batch.taskId !== taskId ||
    projection.batch.status !== "ACTIVE"
  )
    return null;
  const state = reviewPresentation(projection, review.state.generating);
  if (!["pending", "rewrite", "stale", "conflict"].includes(state.kind))
    return null;
  const title =
    state.kind === "pending"
      ? `이 작업의 남은 변경 ${projection.groups.length}개`
      : state.title;
  return (
    <div className="review-resume">
      <div>
        <strong>{title}</strong>
        <p>
          {model.state.tasks.find((task) => task.id === taskId)?.goal} · 아직
          원문에 반영하지 않았습니다.
        </p>
      </div>
      <button type="button" className="primary" onClick={resume}>
        검토 이어가기
      </button>
    </div>
  );
}
