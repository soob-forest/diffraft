import { useState } from "react";
import type { ReviewGroup } from "../generated/ReviewGroup";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { UnitComparisonScope } from "./unit-review-jump";
import { unitFilterLabel } from "./unit-review-model";
import type { UnitNavigation } from "./useUnitNavigation";

type Props = {
  projection: ReviewProjection;
  navigation: UnitNavigation;
  labels: [string, string];
  offscreen: boolean;
  scope: UnitComparisonScope;
};
export function UnitComparisonTools(props: Props) {
  return (
    <div className="unit-comparison-label">
      <details className="comparison-basis">
        <summary>비교 기준</summary>
        <p>
          {props.labels[0]} → {props.labels[1]}
        </p>
      </details>
      <UnitLocationActions {...props} />
      <span className="muted">
        비교 본문에서 F7 다음 {unitFilterLabel(props.navigation.value.filter)}{" "}
        변경 · Shift+F7 이전 변경
      </span>
    </div>
  );
}
function UnitLocationActions({
  projection,
  navigation,
  offscreen,
  scope,
}: Props) {
  const group = projection.groups.find(
    (group) => group.id === navigation.selected?.id,
  );
  return (
    <>
      {offscreen && navigation.selected && (
        <button
          className="unit-offscreen"
          type="button"
          onClick={() =>
            navigation.locate(
              navigation.selected?.id ?? "",
              projection,
              true,
              scope,
            )
          }
        >
          변경 {navigation.selected.number}으로 이동
        </button>
      )}
      {group &&
        !offscreen &&
        (group.beforeRanges.length > 1 ? (
          <UnitLocations
            key={group.id}
            projection={projection}
            navigation={navigation}
            group={group}
            scope={scope}
          />
        ) : (
          <button
            className="unit-location-reset"
            type="button"
            onClick={() => navigation.locatePosition(0, projection, scope)}
          >
            선택 위치로 이동
          </button>
        ))}
    </>
  );
}
function UnitLocations({
  projection,
  navigation,
  group,
  scope,
}: Pick<Props, "projection" | "navigation" | "scope"> & {
  group: ReviewGroup;
}) {
  const [position, setPosition] = useState(0);
  const index = Math.min(position, group.beforeRanges.length - 1);
  return (
    <span className="unit-related-locations">
      <label>
        <span className="visually-hidden">관련 위치 선택</span>
        <select
          aria-label="관련 위치 선택"
          value={index}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (
              !Number.isInteger(next) ||
              next < 0 ||
              next >= group.beforeRanges.length
            )
              return;
            setPosition(next);
            navigation.locatePosition(next, projection, scope);
          }}
        >
          {group.beforeRanges.map((range, next) => (
            <option key={`${range.from}:${range.to}`} value={next}>
              관련 위치 {next + 1} / {group.beforeRanges.length}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label="관련 위치로 이동"
        onClick={() => navigation.locatePosition(index, projection, scope)}
      >
        이동
      </button>
    </span>
  );
}
