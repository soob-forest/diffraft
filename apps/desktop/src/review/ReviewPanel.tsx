import { useEffect } from "react";
import { createPortal } from "react-dom";
import { NavigationSlot } from "../editor/NavigationSlots";
import type { DocumentModel } from "../editor/useDocument";
import { useReviewSurface } from "../editor/WorkspacePanels";
import type { Heading } from "../generated/Heading";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { BatchActions } from "../rewrite/BatchActions";
import { RewriteComparison } from "../rewrite/RewriteComparison";
import { AppliedVersion } from "./AppliedVersion";
import { ApprovalDialog } from "./ApprovalDialog";
import { CommentList } from "./CommentList";
import { DiffViewer } from "./DiffViewer";
import { GroupBar, GroupNavigation } from "./GroupBar";
import { Processed, ProposalDetails, ReviewHeader } from "./ReviewContent";
import { ReviewTaskOptions } from "./ReviewTaskOptions";
import { type Panel, useReviewPanel } from "./useReviewPanel";
import "./review.css";

type Props = {
  active: boolean;
  document: DocumentModel;
  taskId: string;
  rewriteRequest: number;
  flushTask: () => Promise<void>;
  appliedTarget: HTMLDivElement | null;
};
export function ReviewPanel(props: Props) {
  const panel = useReviewPanel(props);
  const surface = useReviewSurface();
  const showDetail = surface?.showDetail;
  useEffect(() => {
    if (props.rewriteRequest) showDetail?.();
  }, [props.rewriteRequest, showDetail]);
  if (!props.taskId)
    return (
      <div className="review-empty" hidden={!props.active}>
        검토할 작업을 먼저 만들거나 선택해 주세요.
      </div>
    );
  return (
    <section
      className="review-panel"
      hidden={!props.active}
      aria-label="제안 검토"
      data-detail-mode={panel.detail.kind}
    >
      <ReviewMessage panel={panel} />
      <ReviewDisplay
        panel={panel}
        active={props.active}
        document={props.document}
      />
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
      {projection?.batch.mode === "REWRITE" && (
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

function ReviewBody({
  panel,
  projection,
  active,
  headings,
}: {
  panel: Panel;
  projection: ReviewProjection;
  active: boolean;
  headings: Heading[];
}) {
  return (
    <>
      {active && (
        <NavigationSlot name="outline">
          <GroupNavigation panel={panel} projection={projection} />
        </NavigationSlot>
      )}
      <DiffViewer
        textDetails={false}
        selectedGroup={panel.selected?.id}
        headings={headings}
        projection={projection}
        onSelection={panel.setSelection}
        onGroupSelect={panel.selectGroup}
        onMove={panel.move}
        jump={panel.jump}
        tools={{
          header: <ReviewPrimary panel={panel} projection={projection} />,
          selection: <GroupBar panel={panel} projection={projection} />,
          compact:
            panel.detail.kind === "comment" ? (
              <CommentSelection panel={panel} projection={projection} />
            ) : null,
        }}
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

function ReviewDisplay({
  panel,
  active,
  document,
}: {
  panel: Panel;
  active: boolean;
  document: DocumentModel;
}) {
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
    <RewriteComparison
      key={`${projection.batch.id}:${projection.currentHeadId}`}
      comparison={projection}
      review={panel.review}
      versions={document.state.versions}
    />
  ) : (
    <ReviewBody
      panel={panel}
      projection={projection}
      active={active}
      headings={document.state.headings}
    />
  );
}

function ReviewPrimary({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <>
      <strong>변경 검토 · 남은 {projection.groups.length}개</strong>
      <details className="review-history-menu">
        <summary>
          제안 기록{" "}
          <span className="diff-stats" data-testid="diff-stats">
            +{projection.stats.addedLines} / −{projection.stats.removedLines}
          </span>
        </summary>
        <ReviewHeader review={panel.review} />
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

function ReviewDetails({ panel, ...props }: Props & { panel: Panel }) {
  const projection = panel.review.projection;
  return (
    <>
      {projection && (
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
          proposals={projection.batch.proposals.filter(
            (p) => p.decision !== "PENDING" || p.validity !== "VALID",
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

function CommentSelection({
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

function ReviewMessage({ panel }: { panel: Panel }) {
  const message = panel.review.error || panel.actions.message;
  return message ? (
    <p role="status" className="review-message">
      {message}
    </p>
  ) : null;
}
