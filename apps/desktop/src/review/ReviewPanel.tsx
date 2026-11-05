import { createPortal } from "react-dom";
import type { DocumentModel } from "../editor/useDocument";
import { useReviewSurface } from "../editor/WorkspacePanels";
import type { ConversationResult } from "../generated/ConversationResult";
import { BatchActions } from "../rewrite/BatchActions";
import { RewriteComparison } from "../rewrite/RewriteComparison";
import { AppliedVersion } from "./AppliedVersion";
import { ApprovalDialog } from "./ApprovalDialog";
import { CommentList } from "./CommentList";
import { CurrentResultNotice } from "./CurrentResultNotice";
import { HistoricalDiff } from "./HistoricalDiff";
import { ReviewComparison } from "./ReviewComparison";
import { Processed, ProposalDetails } from "./ReviewContent";
import { ReviewStatus } from "./ReviewStatus";
import { ReviewTaskOptions } from "./ReviewTaskOptions";
import { ReviewMessage, useReviewEntry } from "./ReviewTools";
import { RewriteReviewStart } from "./RewriteReviewStart";
import { SelectedRequestForm } from "./SelectedRequestForm";
import { SelectionRequestEntry } from "./SelectionRequestEntry";
import { UnitReview } from "./UnitReview";
import { isUnitReview } from "./unit-review-model";
import { type Panel, useReviewPanel } from "./useReviewPanel";
import "./review.css";
import "./selection.css";

type Props = {
  active: boolean;
  document: DocumentModel;
  taskId: string;
  rewriteRequest: number;
  flushTask: () => Promise<void>;
  appliedTarget: HTMLDivElement | null;
  onPreview: () => void;
  onRequest: () => void;
  requestedResult: ConversationResult | null;
  onResult: (result: ConversationResult) => void;
  selectedDraftRequest: number;
};
export function ReviewPanel(props: Props) {
  const panel = useReviewPanel(props);
  const surface = useReviewSurface();
  useReviewEntry(props, panel, surface?.showDetail);
  if (!props.taskId)
    return (
      <div className="review-empty" hidden={!props.active}>
        검토할 작업을 먼저 만들거나 선택해 주세요.
      </div>
    );
  if (panel.review.projection && isUnitReview(panel.review.projection.batch))
    return (
      <>
        <UnitReview
          key={panel.review.projection.batch.id}
          panel={panel}
          document={props.document}
          active={props.active}
          options={
            <ReviewTaskOptions
              panel={panel}
              document={props.document}
              taskId={props.taskId}
              flushTask={props.flushTask}
              rewriteRequest={props.rewriteRequest}
            />
          }
        />
        <PendingApproval panel={panel} />
      </>
    );
  return <StandardReviewPanel {...props} panel={panel} />;
}

function StandardReviewPanel({ panel, ...props }: Props & { panel: Panel }) {
  return (
    <section
      className="review-panel"
      hidden={!props.active}
      aria-label="제안 검토"
      data-detail-mode={panel.detail.kind}
    >
      <ReviewMessage panel={panel} />
      <CurrentResultNotice
        result={props.requestedResult}
        projection={panel.review.projection}
      />
      {panel.review.projection && (
        <ReviewStatus
          projection={panel.review.projection}
          review={panel.review}
          onPreview={props.onPreview}
          onRequest={props.onRequest}
          versions={props.document.state.versions}
        />
      )}
      <div className="review-current" hidden={Boolean(panel.history.target)}>
        <ReviewDisplay
          panel={panel}
          active={props.active}
          document={props.document}
        />
      </div>
      <HistoricalDiff history={panel.history} />
      <ReviewExtras panel={panel} {...props} />
      <PendingApproval panel={panel} />
    </section>
  );
}

function ReviewExtras({ panel, ...props }: Props & { panel: Panel }) {
  const projection = panel.review.projection;
  const surface = useReviewSurface();
  return (
    <>
      {!panel.history.target && projection?.batch.mode === "REWRITE" && (
        <BatchActions
          model={props.document}
          review={panel.review}
          blocked={panel.blocked}
        />
      )}
      {surface?.detail &&
        createPortal(
          <ReviewDetails panel={panel} {...props} />,
          surface.detail,
        )}
      {panel.actions.appliedVersion &&
        props.appliedTarget &&
        createPortal(
          <AppliedVersion
            model={props.document}
            versionId={panel.actions.appliedVersion}
          />,
          props.appliedTarget,
        )}
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
          .then(() => {
            panel.setApproval(null);
          });
      }}
    />
  );
}

function ReviewDisplay({
  panel,
  active,
  document,
}: {
  panel: Panel;
  active: boolean;
  document: DocumentModel;
}) {
  const surface = useReviewSurface();
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
    <>
      <RewriteReviewStart document={document} panel={panel} />
      <RewriteComparison
        active={active && !panel.history.target}
        key={`${projection.batch.id}:${projection.currentHeadId}`}
        comparison={projection}
        review={panel.review}
        versions={document.state.versions}
        selection={{
          onSelection: panel.setSelection,
          onSelectionIssue: panel.setSelectionIssue,
          onEditSelection: () => {
            panel.startSelectedRequest();
            surface?.showDetail();
          },
          tools: panel.selectedRequest.active ? null : (
            <SelectionRequestEntry panel={panel} />
          ),
        }}
      />
    </>
  ) : (
    <ReviewComparison
      panel={panel}
      projection={projection}
      active={active && !panel.history.target}
      headings={document.state.headings}
    />
  );
}

function ReviewDetails({ panel, ...props }: Props & { panel: Panel }) {
  const projection = panel.review.projection;
  return (
    <>
      <SelectedRequestForm panel={panel} onResult={props.onResult} />
      {projection && !panel.history.target && !panel.selectedRequest.active && (
        <ProposalDetails
          panel={panel}
          projection={projection}
          conditions={
            props.document.state.tasks.find((task) => task.id === props.taskId)
              ?.pinnedRules ?? ""
          }
        />
      )}
      {projection && (
        <Processed
          open={(proposal) =>
            panel.history.open({
              batchId: projection.batch.id,
              proposalId: proposal.id,
              revision: proposal.revision,
              previousRevision: null,
            })
          }
          batchStatus={projection.batch.status}
          proposals={projection.batch.proposals.filter(
            (p) =>
              projection.batch.status !== "ACTIVE" ||
              p.decision !== "PENDING" ||
              p.validity !== "VALID",
          )}
        />
      )}
      {panel.review.state.comments.length > 0 && (
        <CommentList
          comments={panel.review.state.comments}
          onSaved={panel.review.refresh}
        />
      )}
      <ReviewTaskOptions
        panel={panel}
        document={props.document}
        taskId={props.taskId}
        flushTask={props.flushTask}
        rewriteRequest={props.rewriteRequest}
      />
    </>
  );
}
