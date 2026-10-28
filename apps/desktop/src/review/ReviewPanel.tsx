import type { DocumentModel } from "../editor/useDocument";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { BatchActions } from "../rewrite/BatchActions";
import { RewriteForm } from "../rewrite/RewriteForm";
import { ApprovalDialog } from "./ApprovalDialog";
import { CommentList } from "./CommentList";
import { ComparisonViewer } from "./ComparisonViewer";
import { DiffViewer } from "./DiffViewer";
import {
  GroupBar,
  Processed,
  ProposalDetails,
  ReviewHeader,
} from "./ReviewContent";
import { type Panel, useReviewPanel } from "./useReviewPanel";
import "./review.css";

type Props = {
  document: DocumentModel;
  taskId: string;
  flushTask: () => Promise<void>;
};
export function ReviewPanel(props: Props) {
  const panel = useReviewPanel(props);
  const projection = panel.review.projection;
  if (!props.taskId)
    return (
      <div className="review-empty">
        검토할 작업을 먼저 만들거나 선택해 주세요.
      </div>
    );
  return (
    <section className="review-panel" aria-label="제안 검토">
      <ReviewHeader review={panel.review} />
      <RewriteForm
        model={props.document}
        review={panel.review}
        taskId={props.taskId}
        flushTask={props.flushTask}
        onBusy={panel.setRegenerating}
      />
      {(panel.review.error || panel.actions.message) && (
        <p role="status" className="review-message">
          {panel.review.error || panel.actions.message}
        </p>
      )}
      <ReviewDisplay panel={panel} />
      {projection && (
        <BatchActions
          model={props.document}
          review={panel.review}
          blocked={panel.blocked}
        />
      )}
      <PendingApproval panel={panel} />
    </section>
  );
}

function ReviewBody({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <>
      <GroupBar panel={panel} projection={projection} />
      {projection.groups.length > 0 && (
        <DiffViewer
          projection={projection}
          onSelection={panel.setSelection}
          onMove={panel.move}
          jump={panel.jump}
        />
      )}
      <ProposalDetails panel={panel} projection={projection} />
      <Processed
        proposals={projection.batch.proposals.filter(
          (p) => p.decision !== "PENDING" || p.validity !== "VALID",
        )}
      />
      <CommentList
        comments={panel.review.state.comments}
        onSaved={panel.review.refresh}
      />
    </>
  );
}

function PendingApproval({ panel }: { panel: Panel }) {
  const projection = panel.review.projection;
  if (!panel.approval || !projection) return null;
  return (
    <ApprovalDialog
      approval={panel.approval}
      projection={projection}
      busy={panel.actions.busy}
      onClose={() => panel.setApproval(null)}
      onApprove={() => {
        if (!panel.approval || panel.blocked) return;
        void panel.actions
          .execute("accept", panel.approval.proposals)
          .then(() => panel.setApproval(null));
      }}
    />
  );
}

function ReviewDisplay({ panel }: { panel: Panel }) {
  const projection = panel.review.projection;
  if (!projection)
    return (
      <p className="review-empty">
        {panel.review.loading
          ? "검토 내용 불러오는 중…"
          : "아직 제안이 없습니다. 이 작업의 AI 요청 결과가 여기에 표시됩니다."}
      </p>
    );
  return projection.batch.mode === "REWRITE" ? (
    <ComparisonViewer
      key={`${projection.batch.id}:${projection.currentHeadId}`}
      comparison={projection}
    />
  ) : (
    <ReviewBody panel={panel} projection={projection} />
  );
}
