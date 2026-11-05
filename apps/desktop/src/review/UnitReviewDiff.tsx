import { useEffect, useRef, useState } from "react";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { VersionSummary } from "../generated/VersionSummary";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { DiffViewer } from "./DiffViewer";
import { UnitComparisonTools } from "./UnitComparisonTools";
import { unitComparisonLabels } from "./unit-comparison-labels";
import { unitComparisonJump } from "./unit-review-jump";
import type { UnitNavigation } from "./useUnitNavigation";
import { useUnitVisibility } from "./useUnitVisibility";

type Props = {
  projection: ReviewProjection;
  navigation: UnitNavigation;
  active: boolean;
  versions: VersionSummary[];
};
export function UnitReviewDiff(props: Props) {
  const original = useOriginal(
    props.projection.batch.id,
    props.navigation.value.original,
  );
  return (
    <>
      <div className="unit-diff-body" hidden={props.navigation.value.original}>
        <UnitDiff
          {...props}
          original={false}
          active={props.active && !props.navigation.value.original}
        />
      </div>
      <div className="unit-diff-body" hidden={!props.navigation.value.original}>
        {original.error && (
          <p role="alert">
            {original.error}
            <button type="button" onClick={original.retry}>
              다시 불러오기
            </button>
          </p>
        )}
        {!original.value && !original.error && (
          <p role="status">원래 전체 후보를 불러오는 중…</p>
        )}
        {original.value && (
          <UnitDiff
            {...props}
            projection={original.value}
            original
            active={props.active && props.navigation.value.original}
          />
        )}
      </div>
    </>
  );
}

type UnitDiffProps = Props & { original: boolean };
function UnitDiff(props: UnitDiffProps) {
  const { projection, navigation, active, original } = props;
  const labels = unitComparisonLabels(projection, props.versions, original);
  const visibility = useUnitVisibility(
    navigation.selected?.id,
    active,
    projection.groups.some((group) => group.id === navigation.selected?.id),
  );
  useOriginalLocation(projection, navigation, active && original);
  return (
    <div className="unit-comparison" ref={visibility.root}>
      <DiffViewer
        {...comparisonProps(props, labels)}
        tools={{
          header: null,
          selection: null,
          compact: (
            <UnitComparisonTools
              projection={projection}
              navigation={navigation}
              labels={labels}
              offscreen={visibility.offscreen}
              scope={original ? "original" : "current"}
            />
          ),
        }}
      />
    </div>
  );
}

function comparisonProps(
  { projection, navigation, active, original }: UnitDiffProps,
  labels: [string, string],
) {
  const value = navigation.value;
  const scope = original ? "original" : "current";
  return {
    active,
    projection,
    labels,
    selectedGroup: navigation.selected?.id ?? "",
    onSelection: () => {},
    onGroupSelect: (id: string) => navigation.choose(id, projection, scope),
    onMove: (direction: number) =>
      navigation.move(direction, projection, scope),
    jump: unitComparisonJump(navigation.jump, scope, active),
    preferences: {
      split: value.split,
      full: value.full,
      whitespace: value.whitespace,
      onChange: navigation.update,
    },
    scrollKey: original ? value.originalScrollKey : value.scrollKey,
    onRememberScroll: (key: string) => navigation.remember(key, original),
  };
}

function useOriginal(batchId: string, enabled: boolean) {
  const [value, setValue] = useState<ReviewProjection | null>(null),
    [error, setError] = useState("");
  const [request, setRequest] = useState({ batchId });
  useEffect(() => {
    if (!enabled || value) return;
    let active = true;
    setError("");
    reviewCommand(
      { kind: "original_rewrite", batchId: request.batchId },
      "projection",
    ).then(
      (next) => {
        if (active) setValue(next);
      },
      (reason) => {
        if (active) setError(errorMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [request, enabled, value]);
  return { value, error, retry: () => setRequest({ batchId }) };
}

function useOriginalLocation(
  projection: ReviewProjection,
  navigation: UnitNavigation,
  active: boolean,
) {
  const located = useRef("");
  useEffect(() => {
    if (!active || !navigation.selected) return;
    const key = `${projection.batch.id}:${navigation.selected.id}`;
    if (located.current === key) return;
    const restored = !located.current && navigation.value.originalScrollKey;
    located.current = key;
    if (!restored)
      navigation.locate(navigation.selected.id, projection, false, "original");
  }, [
    projection,
    active,
    navigation.selected,
    navigation.locate,
    navigation.value.originalScrollKey,
  ]);
}
