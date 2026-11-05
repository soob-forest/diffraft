import { useEffect, useRef, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import { useReviewSurface } from "../editor/WorkspacePanels";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { reviewFingerprint } from "./state";
import {
  nextPendingUnit,
  unitDecision,
  unitReferences,
} from "./unit-review-model";
import { useReopenedNavigation } from "./useReopenedNavigation";
import type { Panel } from "./useReviewPanel";
import { type UnitNavigation, useUnitNavigation } from "./useUnitNavigation";

export function useUnitReviewController(
  panel: Panel,
  document: DocumentModel,
  projection: ReviewProjection,
) {
  const navigation = useUnitNavigation(projection);
  const focus = useDecisionFocus(panel, navigation, document.mutating);
  const commentFocus = useCommentFocus(navigation.selected?.id);
  const reopen = useReopenedNavigation(panel, navigation, focus.title);
  const invalid = invalidReview(projection);
  const blocked =
    panel.blocked ||
    invalid ||
    reopen.busy ||
    navigation.draft.locked ||
    document.autosave.document.versionId !== projection.currentHeadId;
  const decide = unitDecisionAction({
    panel,
    navigation,
    blocked,
    projection,
    onSuccess: focus.request,
  });
  return {
    navigation,
    invalid,
    blocked,
    attention: Boolean(
      (invalid && projection.batch.status === "ACTIVE") ||
        document.status.error ||
        panel.review.error ||
        (panel.actions.messageKind === "attention" && panel.actions.message),
    ),
    reopen,
    title: focus.title,
    decide,
    ...commentFocus,
    comments: panel.review.state.unitComments.filter(
      (comment) => comment.batchId === projection.batch.id,
    ),
  };
}

function invalidReview(projection: ReviewProjection) {
  return (
    projection.batch.status !== "ACTIVE" ||
    projection.currentHeadId !== projection.batch.applyHeadId ||
    projection.batch.proposals.some(
      (p) => p.decision === "PENDING" && p.validity !== "VALID",
    )
  );
}

function useDecisionFocus(
  panel: Panel,
  navigation: UnitNavigation,
  mutating: boolean,
) {
  const title = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [handled, setHandled] = useState(0);
  const completion = panel.actions.completion;
  const next =
    completion &&
    completion.serial !== handled &&
    completion.batchId === panel.review.projection?.batch.id
      ? completion
      : null;
  const awaiting = pending ?? next?.fingerprint;
  const fingerprint = reviewFingerprint(panel.review.projection);
  useEffect(() => {
    if (
      awaiting == null ||
      awaiting === fingerprint ||
      panel.review.loading ||
      panel.actions.busy ||
      panel.approval ||
      mutating
    )
      return;
    setPending(null);
    if (next) setHandled(next.serial);
    if (navigation.selected)
      navigation.locate(navigation.selected.id, undefined, false);
    requestAnimationFrame(() => {
      if (panel.review.projection?.groups.length) title.current?.focus();
      else
        document.querySelector<HTMLElement>(".unit-progress strong")?.focus();
    });
  }, [navigation, panel, awaiting, next, fingerprint, mutating]);
  return {
    title,
    request: () => {
      setPending(fingerprint);
    },
  };
}

function unitDecisionAction({
  panel,
  navigation,
  blocked,
  projection,
  onSuccess,
}: {
  panel: Panel;
  navigation: UnitNavigation;
  blocked: boolean;
  projection: ReviewProjection;
  onSuccess: () => void;
}) {
  return async (kind: "accept" | "reject") => {
    if (
      blocked ||
      !navigation.selected ||
      unitDecision(projection.batch, navigation.selected) !== "PENDING"
    )
      return;
    const next = nextPendingUnit(projection.batch, navigation.selected.id);
    if (
      await panel.actions.execute(
        kind,
        unitReferences(projection.batch, navigation.selected),
      )
    ) {
      if (next) navigation.update({ selectedId: next.id, original: false });
      onSuccess();
    }
  };
}
export type UnitReviewController = ReturnType<typeof useUnitReviewController>;

function useCommentFocus(unitId: string | undefined) {
  const surface = useReviewSurface();
  const [commentRequest, setCommentRequest] = useState({ id: "", serial: 0 });
  return {
    commentRequest: commentRequest.id === unitId ? commentRequest.serial : 0,
    commentFocused: () =>
      setCommentRequest((current) => ({ ...current, id: "" })),
    comment: () => {
      setCommentRequest((value) => ({
        id: unitId ?? "",
        serial: value.serial + 1,
      }));
      surface?.showDetail();
    },
  };
}
