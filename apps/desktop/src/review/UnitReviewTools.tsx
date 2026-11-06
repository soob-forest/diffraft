import type { ReactNode, RefObject } from "react";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { ReviewUnit } from "../generated/ReviewUnit";
import { unitReviewFeedback } from "./review-feedback";
import { UnitDecisionActions } from "./UnitDecisionActions";
import { UnitFilter } from "./UnitFilter";
import { UnitReviewMenu } from "./UnitReviewMenu";
import {
  decisionLabel,
  unitCounts,
  unitDecision,
  unitFilterLabel,
} from "./unit-review-model";
import { useDecisionPointerGuard } from "./useDecisionPointerGuard";
import type { Panel } from "./useReviewPanel";
import type { UnitNavigation } from "./useUnitNavigation";

export type UnitToolsProps = {
  panel: Panel;
  projection: ReviewProjection;
  navigation: UnitNavigation;
  blocked: boolean;
  title: RefObject<HTMLHeadingElement | null>;
  onDecide: (kind: "accept" | "reject") => void;
  onComment: () => void;
  onReopen: (unit: ReviewUnit) => void;
  options: ReactNode;
  notice: string;
  noticeImportant?: boolean;
};
export function UnitReviewTools(props: UnitToolsProps) {
  useDecisionPointerGuard();
  return (
    <header className="unit-review-tools">
      <div className="unit-core">
        <h3
          ref={props.title}
          tabIndex={-1}
          className="unit-selected-heading"
          aria-label={
            props.navigation.selected
              ? `변경 ${props.navigation.selected.number} · ${props.navigation.selected.title}`
              : "선택한 변경 없음"
          }
        >
          <UnitPicker {...props} />
        </h3>
        <UnitActions {...props} />
      </div>
      <UnitCoupling {...props} />
      <UnitProgress {...props} />
      {props.navigation.value.original && (
        <OriginalNotice navigation={props.navigation} />
      )}
    </header>
  );
}
function OriginalNotice({ navigation }: { navigation: UnitNavigation }) {
  return (
    <p className="unit-original-notice">
      <span>원래 전체 후보 · 읽기 전용 </span>
      <button
        type="button"
        onClick={() => {
          navigation.update({ original: false });
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(".unit-selected-heading")
              ?.focus({ preventScroll: true }),
          );
        }}
      >
        현재 검토로 돌아가기
      </button>
    </p>
  );
}
function UnitPicker({ projection, navigation }: UnitToolsProps) {
  const selected = navigation.selected;
  const title = selected
    ? `변경 ${selected.number} · ${selected.title}`
    : "선택한 변경 없음";
  return (
    <label className="unit-picker">
      <span className="visually-hidden">변경 선택</span>
      <select
        aria-label="변경 선택"
        title={title}
        disabled={!navigation.units.length}
        value={selected?.id ?? ""}
        onChange={(event) => navigation.choose(event.target.value)}
      >
        {!navigation.units.length && (
          <option value="">이 목록에 변경 없음</option>
        )}
        {navigation.units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            변경 {unit.number} · {unit.title} ·{" "}
            {decisionLabel(unitDecision(projection.batch, unit))}
          </option>
        ))}
      </select>
    </label>
  );
}
function UnitActions(props: UnitToolsProps) {
  const { navigation, projection, blocked } = props;
  const unit = navigation.selected;
  const decision = unit && unitDecision(projection.batch, unit);
  return (
    <div className="unit-actions">
      <UnitMoveControls navigation={navigation} />
      {unit && !navigation.value.original && decision === "PENDING" && (
        <UnitDecisionActions
          blocked={blocked}
          number={unit.number}
          onDecide={props.onDecide}
        />
      )}
      <ProcessedUnitActions {...props} />
      <button
        type="button"
        className="unit-comment-trigger"
        disabled={blocked || !unit}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          props.onComment();
        }}
      >
        코멘트
      </button>
    </div>
  );
}
function ProcessedUnitActions(props: UnitToolsProps) {
  const { navigation, projection, blocked } = props;
  const unit = navigation.selected;
  if (!unit) return null;
  const decision = unitDecision(projection.batch, unit);
  return (
    <>
      {decision === "REJECTED" && (
        <button
          type="button"
          disabled={blocked}
          onClick={() => props.onReopen(unit)}
        >
          다시 검토
        </button>
      )}
      {!navigation.value.original && decision !== "PENDING" && (
        <button
          type="button"
          onClick={() => navigation.update({ original: true })}
        >
          당시 변경 보기
        </button>
      )}
    </>
  );
}
function UnitMoveControls({ navigation }: { navigation: UnitNavigation }) {
  const label = unitFilterLabel(navigation.value.filter);
  return (
    <>
      <button
        type="button"
        aria-label={`이전 ${label} 변경`}
        disabled={!navigation.units.length}
        onClick={() => navigation.move(-1)}
      >
        이전
      </button>
      <button
        type="button"
        aria-label={`다음 ${label} 변경`}
        disabled={!navigation.units.length}
        onClick={() => navigation.move(1)}
      >
        다음
      </button>
    </>
  );
}
function UnitProgress(props: UnitToolsProps) {
  const counts = unitCounts(props.projection.batch);
  const feedback = unitReviewFeedback({
    notice: props.notice,
    noticeImportant: props.noticeImportant,
    reviewError: props.panel.review.error,
    actionMessage: props.panel.actions.message,
    actionKind: props.panel.actions.messageKind,
  });
  return (
    <div className="unit-progress">
      <strong tabIndex={-1}>
        {counts.pending
          ? "변경별 검토"
          : props.projection.batch.reviewUnits.length
            ? "검토 완료"
            : "변경 없음"}
      </strong>
      <span className="unit-counts">
        승인 {counts.accepted} · 거절 {counts.rejected} · 남은 {counts.pending}
      </span>
      <button
        className="unit-bulk-accept"
        type="button"
        disabled={
          props.blocked || !counts.pending || props.navigation.value.original
        }
        onClick={() => props.panel.confirm()}
      >
        남은 {counts.pending}개 승인…
      </button>
      <UnitFilter navigation={props.navigation} />
      <span
        className={feedback.important ? "unit-review-alert" : "unit-feedback"}
        role={feedback.important ? "alert" : "status"}
        title={feedback.text}
      >
        {feedback.text}
      </span>
      <UnitReviewMenu {...props} feedback={feedback.text} />
    </div>
  );
}

function UnitCoupling({ projection, navigation }: UnitToolsProps) {
  const unit = navigation.selected;
  const group = projection.groups.find((group) => group.id === unit?.id);
  if (!unit || unit.proposals.length < 2) return null;
  const count = group?.beforeRanges.length ?? unit.proposals.length;
  return (
    <details className="unit-coupling">
      <summary>연결된 {count}곳을 함께 승인합니다</summary>
      <p>{unit.reason}</p>
    </details>
  );
}
