import type { ReviewBatch } from "../generated/ReviewBatch";
import type { UnitComment } from "../generated/UnitComment";
import { UnitFilter } from "./UnitFilter";
import { decisionLabel, unitDecision, unitLabel } from "./unit-review-model";
import type { UnitNavigation } from "./useUnitNavigation";

export function UnitReviewNavigation({
  batch,
  navigation,
  comments,
}: {
  batch: ReviewBatch;
  navigation: UnitNavigation;
  comments: UnitComment[];
}) {
  return (
    <nav className="unit-navigation" aria-label="변경 목록">
      <h3>변경 목록</h3>
      <UnitFilter navigation={navigation} />
      {!navigation.units.length && <p>이 목록에 표시할 변경이 없습니다.</p>}
      <UnitNavigationItems
        batch={batch}
        navigation={navigation}
        comments={comments}
      />
    </nav>
  );
}

function UnitNavigationItems({
  batch,
  navigation,
  comments,
}: {
  batch: ReviewBatch;
  navigation: UnitNavigation;
  comments: UnitComment[];
}) {
  return (
    <>
      {" "}
      {navigation.units.map((unit) => (
        <button
          type="button"
          key={unit.id}
          aria-pressed={navigation.selected?.id === unit.id}
          onClick={() => navigation.choose(unit.id)}
        >
          <strong>
            변경 {unit.number} · {unit.title}
          </strong>
          <span>
            {unitLabel(unit.kind)} · {decisionLabel(unitDecision(batch, unit))}{" "}
            · 코멘트{" "}
            {comments.filter((comment) => comment.unitId === unit.id).length}
          </span>
        </button>
      ))}
    </>
  );
}
