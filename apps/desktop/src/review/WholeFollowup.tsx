import { useReviewSurface } from "../editor/WorkspacePanels";
import { ChangeQuestionEntry } from "./ChangeQuestionEntry";
import type { Panel } from "./useReviewPanel";
export function WholeFollowup({
  panel,
  projection,
}: {
  panel: Panel;
  projection: NonNullable<Panel["review"]["projection"]>;
}) {
  const surface = useReviewSurface();
  return (
    <section className="whole-followup">
      <h3>이 전체 수정안</h3>
      <button
        type="button"
        disabled={
          panel.blocked ||
          projection.batch.status !== "ACTIVE" ||
          !projection.after.length
        }
        onClick={() => {
          panel.selectedRequest.begin(projection, {
            side: "after",
            from: 0,
            to: projection.after.length,
          });
          surface?.showDetail();
        }}
      >
        더 고치기
      </button>
      <ChangeQuestionEntry
        blocked={panel.blocked}
        request={{
          documentId: projection.batch.documentId,
          taskId: projection.batch.taskId,
          batchId: projection.batch.id,
          expectedHeadId: projection.currentHeadId,
          subject: { kind: "whole" },
        }}
      />
    </section>
  );
}
