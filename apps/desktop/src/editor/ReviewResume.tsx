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
  const count = projection.groups.length;
  const rewrite =
    projection.batch.mode === "REWRITE" &&
    projection.batch.baseVersionId === model.autosave.document.versionId;
  if (!count && !rewrite) return null;
  return (
    <div className="review-resume">
      <div>
        <strong>
          {rewrite
            ? "전체 재작성 후보가 기다리고 있습니다."
            : `이 작업의 남은 변경 ${count}개`}
        </strong>
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
