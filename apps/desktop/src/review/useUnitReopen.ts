import { useEffect, useRef, useState } from "react";
import type { ReopenUnitReview } from "../generated/ReopenUnitReview";
import type { ReviewUnit } from "../generated/ReviewUnit";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import type { Panel } from "./useReviewPanel";

export function useUnitReopen(
  panel: Panel,
  onReopened: (unit: ReviewUnit) => void,
) {
  const [busy, setBusy] = useState(false);
  const setMessage = panel.actions.setMessage;
  const lock = useRef(false),
    active = useRef(true),
    pending = useRef<ReopenUnitReview | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const reopen = async (unit: ReviewUnit) => {
    const projection = panel.review.projection;
    if (!projection || panel.blocked || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      pending.current = reopenRequest(pending.current, projection, unit);
      await reviewCommand(
        { kind: "reopen_unit_review", request: pending.current },
        "batch",
      );
      pending.current = null;
      if (active.current) {
        setMessage(
          `변경 ${unit.number}을 다시 검토합니다. 원문은 그대로입니다.`,
        );
        onReopened(unit);
        panel.review.refresh();
      }
    } catch (reason) {
      if (active.current) setMessage(errorMessage(reason), "attention");
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  return { busy, reopen };
}

function reopenRequest(
  previous: ReopenUnitReview | null,
  projection: NonNullable<Panel["review"]["projection"]>,
  unit: ReviewUnit,
): ReopenUnitReview {
  if (
    !previous ||
    previous.unitId !== unit.id ||
    previous.expectedReviewRevision !== unit.reviewRevision ||
    previous.expectedHeadId !== projection.currentHeadId
  )
    return {
      documentId: projection.batch.documentId,
      batchId: projection.batch.id,
      planId: unit.planId,
      unitId: unit.id,
      expectedHeadId: projection.currentHeadId,
      expectedReviewRevision: unit.reviewRevision,
      operationId: crypto.randomUUID(),
    };
  return previous;
}
