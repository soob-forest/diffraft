import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavigationSlot } from "../editor/NavigationSlots";
import type { DocumentModel } from "../editor/useDocument";
import { useReviewSurface } from "../editor/WorkspacePanels";
import { QuestionTarget } from "../generation/QuestionTarget";
import { BatchActions } from "../rewrite/BatchActions";
import { AppliedVersion } from "./AppliedVersion";
import { ChangeQuestionEntry } from "./ChangeQuestionEntry";
import { UnitComments } from "./UnitComments";
import { UnitReviewDiff } from "./UnitReviewDiff";
import { UnitReviewNavigation } from "./UnitReviewNavigation";
import { UnitReviewTools } from "./UnitReviewTools";
import type { Panel } from "./useReviewPanel";
import {
  type UnitReviewController,
  useUnitReviewController,
} from "./useUnitReviewController";
import { useUnitViewport } from "./useUnitViewport";
import "./unit-review.css";
import "./unit-review-layout.css";
import "./unit-review-short.css";
import "./unit-review-feedback.css";

type Props = {
  panel: Panel;
  document: DocumentModel;
  active: boolean;
  options: ReactNode;
};
export function UnitReview(props: Props) {
  const projection = props.panel.review.projection;
  if (!projection) return null;
  return <UnitReviewContent {...props} projection={projection} />;
}

function UnitReviewContent({
  panel,
  document,
  active,
  projection,
  options,
}: Props & { projection: NonNullable<Panel["review"]["projection"]> }) {
  const controller = useUnitReviewController(panel, document, projection);
  const root = useUnitViewport(active, controller.attention);
  const { navigation, comments } = controller;
  return (
    <section
      ref={root}
      className="review-panel unit-review"
      hidden={!active}
      aria-label="제안 검토"
    >
      <UnitReviewHeading
        panel={panel}
        document={document}
        projection={projection}
        controller={controller}
      />
      {active && (
        <NavigationSlot name="outline">
          <UnitReviewNavigation
            batch={projection.batch}
            navigation={navigation}
            comments={comments}
          />
        </NavigationSlot>
      )}
      <UnitReviewDiff
        projection={projection}
        navigation={navigation}
        active={active}
        versions={document.state.versions}
      />
      <UnitReviewDetail
        panel={panel}
        projection={projection}
        controller={controller}
        options={options}
      />
    </section>
  );
}

function UnitReviewDetail({
  panel,
  projection,
  controller,
  options,
}: {
  panel: Panel;
  projection: NonNullable<Panel["review"]["projection"]>;
  controller: UnitReviewController;
  options: ReactNode;
}) {
  const surface = useReviewSurface();
  const { navigation, comments, blocked, commentRequest } = controller;
  return (
    <>
      {" "}
      {surface?.detail &&
        createPortal(
          <>
            {controller.requestedQuestion && (
              <QuestionTarget question={controller.requestedQuestion} />
            )}
            <UnitFollowup projection={projection} controller={controller} />
            {navigation.selected && (
              <UnitComments
                key={navigation.selected.id}
                batch={projection.batch}
                unit={navigation.selected}
                comments={comments.filter(
                  (comment) => comment.unitId === navigation.selected?.id,
                )}
                blocked={blocked}
                focusRequest={commentRequest}
                onFocusHandled={controller.commentFocused}
                onSaved={panel.review.refresh}
              />
            )}{" "}
            {options}
          </>,
          surface.detail,
        )}
    </>
  );
}

function UnitReviewHeading({
  panel,
  document,
  projection,
  controller,
}: {
  panel: Panel;
  document: DocumentModel;
  projection: NonNullable<Panel["review"]["projection"]>;
  controller: UnitReviewController;
}) {
  const { navigation, invalid, blocked, reopen, title, decide } = controller;
  return (
    <UnitReviewTools
      panel={panel}
      projection={projection}
      navigation={navigation}
      blocked={blocked}
      title={title}
      onDecide={(kind) => void decide(kind)}
      onComment={controller.comment}
      onReopen={(unit) => void reopen.reopen(unit)}
      noticeImportant={
        Boolean(document.status.error) ||
        (invalid && projection.batch.status === "ACTIVE")
      }
      notice={
        document.status.error ||
        (invalid
          ? projection.batch.status !== "ACTIVE"
            ? "이전 검토 · 읽기 전용"
            : "문서 기준이 바뀌어 승인할 수 없습니다. 최신 확정본에서 새 요청을 준비해 주세요."
          : "")
      }
      options={
        <UnitBatchOptions panel={panel} document={document} blocked={blocked} />
      }
    />
  );
}

function UnitBatchOptions({
  panel,
  document,
  blocked,
}: {
  panel: Panel;
  document: DocumentModel;
  blocked: boolean;
}) {
  return (
    <>
      <BatchActions model={document} review={panel.review} blocked={blocked} />
      {panel.actions.appliedVersion && (
        <AppliedVersion
          model={document}
          versionId={panel.actions.appliedVersion}
        />
      )}
    </>
  );
}

function UnitFollowup({
  projection,
  controller,
}: {
  projection: NonNullable<Panel["review"]["projection"]>;
  controller: UnitReviewController;
}) {
  const surface = useReviewSurface();
  const { navigation, blocked } = controller;
  return (
    <>
      {" "}
      {navigation.selected && (
        <ChangeQuestionEntry
          blocked={blocked}
          request={{
            documentId: projection.batch.documentId,
            taskId: projection.batch.taskId,
            batchId: projection.batch.id,
            expectedHeadId: projection.currentHeadId,
            subject: {
              kind: "unit",
              id: navigation.selected.id,
              revision: navigation.selected.reviewRevision,
            },
          }}
        />
      )}
      <p>
        변경별 검토에서는 후보를 직접 수정하지 않습니다. 확정본에서 수정할
        원문을 다시 선택해 주세요.
      </p>
      <button type="button" onClick={() => surface?.showSource()}>
        확정본에서 새 요청
      </button>
    </>
  );
}
