import { useEffect, useState } from "react";
import type { ReviewGroup } from "../generated/ReviewGroup";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import {
  groupAtSelection,
  groupJumpSelection,
  restoreGroupSelection,
} from "./group-selection";
import { reviewRows } from "./rows";
import { reviewFingerprint } from "./state";

export function useGroupNavigation(projection: ReviewProjection | null) {
  const { selected, setSelectedId } = useGroupChoice(projection);
  const [selection, setSelection] = useState<LogicalSelection | null>(null);
  const fingerprint = reviewFingerprint(projection);
  useEffect(() => {
    if (fingerprint) setSelection(null);
  }, [fingerprint]);
  const { jump, setJump } = useReviewJump();
  const groups = projection?.groups ?? [];
  return {
    selected,
    selectRange: (selection: LogicalSelection) => {
      setSelection(selection);
      setJump((previous) => ({
        selection,
        serial: (previous?.serial ?? 0) + 1,
      }));
    },
    selectGroup: (id: string) => {
      if (groups.some((group) => group.id === id)) setSelectedId(id);
    },
    selection,
    setSelection: (value: LogicalSelection | null) => {
      setSelection(value);
      if (value && projection) {
        const group = groupAtSelection(projection, value);
        if (group) setSelectedId(group.id);
      }
    },
    jump,
    choose: (group: ReviewGroup) => {
      if (projection) chooseGroup(projection, group, setSelectedId, setJump);
    },
    move: (direction: number) => {
      const index = groups.findIndex((g) => g.id === selected?.id);
      const next = groups[(index + direction + groups.length) % groups.length];
      if (next && projection)
        chooseGroup(projection, next, setSelectedId, setJump);
    },
  };
}

function useGroupChoice(projection: ReviewProjection | null) {
  const [choice, setChoice] = useState({
    batchId: "",
    groupId: "",
    proposalId: "",
  });
  const sameBatch = choice.batchId === projection?.batch.id;
  const selected = restoreGroupSelection(
    projection,
    sameBatch ? choice.groupId : "",
    sameBatch ? choice.proposalId : "",
  );
  return {
    selected,
    setSelectedId: (id: string) => {
      const group = projection?.groups.find((g) => g.id === id);
      if (group && projection)
        setChoice({
          batchId: projection.batch.id,
          groupId: group.id,
          proposalId: group.proposals[0]?.id ?? "",
        });
    },
  };
}

function useReviewJump() {
  const [jump, setJump] = useState<{
    selection: LogicalSelection;
    serial: number;
  } | null>(null);
  return { jump, setJump };
}

function chooseGroup(
  projection: ReviewProjection,
  group: ReviewGroup,
  setSelectedId: (id: string) => void,
  setJump: ReturnType<typeof useReviewJump>["setJump"],
) {
  setSelectedId(group.id);
  const target = groupJumpSelection(
    projection,
    reviewRows(projection, new Set(), false),
    group.id,
  );
  if (!target) return;
  setJump((previous) => ({
    selection: target,
    serial: (previous?.serial ?? 0) + 1,
  }));
}
