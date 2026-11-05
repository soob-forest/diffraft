import { useEffect, useState } from "react";
import { useSessionDraft } from "../drafts/SessionDrafts";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { ReviewUnit } from "../generated/ReviewUnit";
import type { LogicalSelection } from "./coordinates";
import { groupJumpSelection } from "./group-selection";
import { reviewRows } from "./rows";
import type { UnitComparisonScope, UnitJump } from "./unit-review-jump";
import { unitLocation } from "./unit-review-location";
import {
  adjacentUnit,
  filteredUnits,
  initialUnitView,
  normalizeUnitView,
  type UnitViewState,
  unitDecision,
} from "./unit-review-model";

type JumpSink = (
  selection: LogicalSelection | null,
  scope: UnitComparisonScope,
  focus?: boolean,
) => void;
export function useUnitNavigation(projection: ReviewProjection) {
  const draft = useUnitViewDraft(projection),
    { batch } = projection;
  const value = normalizeUnitView(batch, draft.value);
  useEffect(() => {
    draft.update((current) => normalizeUnitView(batch, current));
  }, [batch, draft]);
  const [jump, setJump] = useState<UnitJump | null>(null);
  const units = filteredUnits(batch, value.filter);
  const selected = units.find((unit) => unit.id === value.selectedId);
  const send: JumpSink = (selection, scope, focus = true) => {
    if (selection)
      setJump((old) => ({
        selection,
        scope,
        focus,
        serial: (old?.serial ?? 0) + 1,
        revealGroupHeading: true,
      }));
  };
  return {
    draft,
    value,
    selected,
    units,
    jump,
    ...navigationCommands({ projection, draft, selected, units, send }),
  };
}
function useUnitViewDraft({ batch }: ReviewProjection) {
  return useSessionDraft<UnitViewState>(
    JSON.stringify([
      "review-navigation",
      batch.documentId,
      batch.taskId,
      batch.id,
      batch.reviewPlan?.id ?? "",
    ]),
    initialUnitView,
  );
}
type Commands = {
  projection: ReviewProjection;
  draft: ReturnType<typeof useUnitViewDraft>;
  selected: ReviewUnit | undefined;
  units: ReviewUnit[];
  send: JumpSink;
};
function navigationCommands({
  projection,
  draft,
  selected,
  units,
  send,
}: Commands) {
  const { update, remember } = viewCommands(projection, draft);
  const locations = locationCommands({ projection, draft, selected, send });
  const choose = (
    id: string,
    comparison = projection,
    scope: UnitComparisonScope = "current",
  ) => {
    const unit = units.find((unit) => unit.id === id);
    if (!unit) return;
    const original = unitDecision(projection.batch, unit) !== "PENDING";
    update({ selectedId: id, original });
    if (!original) locations.locate(id);
    else if (scope === "original")
      locations.locate(id, comparison, true, scope);
  };
  return {
    update,
    choose,
    remember,
    ...locations,
    move: (
      direction: number,
      comparison = projection,
      scope: UnitComparisonScope = "current",
    ) => {
      const next = adjacentUnit(units, selected?.id, direction);
      if (next) choose(next.id, comparison, scope);
    },
  };
}
function locationCommands({
  projection,
  draft,
  selected,
  send,
}: Omit<Commands, "units">) {
  const locate = (
    id: string,
    comparison = projection,
    focus = true,
    scope: UnitComparisonScope = "current",
  ) =>
    send(
      groupJumpSelection(
        comparison,
        reviewRows(comparison, new Set(), draft.value.full),
        id,
      ),
      scope,
      focus,
    );
  return {
    locate,
    locatePosition: (
      index: number,
      comparison = projection,
      scope: UnitComparisonScope = "current",
    ) => send(unitLocation(comparison, selected?.id, index), scope),
  };
}
function viewCommands(
  projection: ReviewProjection,
  draft: ReturnType<typeof useUnitViewDraft>,
) {
  const update = (change: Partial<UnitViewState>) =>
    draft.update((current) =>
      normalizeUnitView(projection.batch, { ...current, ...change }),
    );
  return {
    update,
    remember: (key: string, original: boolean) => {
      const field = original ? "originalScrollKey" : "scrollKey";
      if (key && key !== draft.value[field])
        draft.update((current) =>
          current[field] === key ? current : { ...current, [field]: key },
        );
    },
  };
}
export type UnitNavigation = ReturnType<typeof useUnitNavigation>;
