import { useRef, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { DecisionRequest } from "../generated/DecisionRequest";
import type { ProposalRevision } from "../generated/ProposalRevision";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { useReviewMessage } from "./review-feedback";
import { reviewFingerprint } from "./state";
import type { ReviewModel } from "./useReview";

type DecisionAction = { kind: "accept" | "reject"; decision: DecisionRequest };
export function useReviewActions(document: DocumentModel, review: ReviewModel) {
  const [busy, setBusy] = useState(false),
    [appliedVersion, setAppliedVersion] = useState("");
  const feedback = useReviewMessage();
  const { setMessage } = feedback;
  const lock = useRef(false);
  const pending = useRef<DecisionAction | null>(null);
  const completion = useDecisionCompletion(review);
  const execute = async (
    kind: DecisionAction["kind"],
    proposals: ProposalRevision[],
  ) => {
    if (lock.current || !review.projection) return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await document.autosave.flush();
      const decision = makeDecision(review, proposals);
      if (
        !pending.current ||
        !sameDecision(pending.current, { kind, decision })
      )
        pending.current = { kind, decision };
      const action = pending.current;
      const apply = () => applyDecision(document, action);
      const saved = await document.gate.run(apply);
      if (kind === "accept") setAppliedVersion(action.decision.expectedHeadId);
      pending.current = null;
      setMessage(decisionMessage(review, action, saved?.version));
      completion.mark();
      review.refresh();
      return true;
    } catch (error) {
      setMessage(errorMessage(error), "attention");
      review.refresh();
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    ...feedback,
    execute,
    appliedVersion,
    completion: completion.value,
  };
}

function useDecisionCompletion(review: ReviewModel) {
  const [value, setValue] = useState<{
    batchId: string;
    fingerprint: string;
    serial: number;
  } | null>(null);
  return {
    value,
    mark: () =>
      setValue((previous) => ({
        batchId: review.projection?.batch.id ?? "",
        fingerprint: reviewFingerprint(review.projection),
        serial: (previous?.serial ?? 0) + 1,
      })),
  };
}

async function applyDecision(document: DocumentModel, action: DecisionAction) {
  if (action.kind === "accept") {
    const saved = await reviewCommand(action, "document");
    document.adoptSaved(saved);
    return saved;
  }
  await reviewCommand(action, "batch");
  return null;
}

function decisionMessage(
  review: ReviewModel,
  action: DecisionAction,
  version?: number,
) {
  const units =
    review.projection?.batch.reviewUnits.filter((unit) =>
      unit.proposals.some((p) =>
        action.decision.proposals.some((target) => target.id === p.id),
      ),
    ) ?? [];
  const target =
    units.length === 1
      ? `변경 ${units[0].number}`
      : units.length
        ? `변경 ${units.length}개`
        : `${action.decision.proposals.length}개 제안`;
  return `${target} ${action.kind === "accept" ? "승인" : "거절"} 완료.${version ? ` · v${version} 저장됨` : " 원문은 그대로입니다."}`;
}
function makeDecision(
  review: ReviewModel,
  proposals: ProposalRevision[],
): DecisionRequest {
  const projection = review.projection;
  if (!projection) throw new Error("비교 내용을 먼저 불러와 주세요.");
  return {
    documentId: projection.batch.documentId,
    batchId: projection.batch.id,
    expectedHeadId: projection.currentHeadId,
    operationId: crypto.randomUUID(),
    proposals,
  };
}
function sameDecision(left: DecisionAction, right: DecisionAction) {
  return (
    JSON.stringify({
      ...left,
      decision: { ...left.decision, operationId: "" },
    }) ===
    JSON.stringify({
      ...right,
      decision: { ...right.decision, operationId: "" },
    })
  );
}
