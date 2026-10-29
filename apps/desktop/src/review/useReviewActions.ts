import { useRef, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { DecisionRequest } from "../generated/DecisionRequest";
import type { ProposalRevision } from "../generated/ProposalRevision";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import type { ReviewModel } from "./useReview";

type DecisionAction = { kind: "accept" | "reject"; decision: DecisionRequest };
export function useReviewActions(document: DocumentModel, review: ReviewModel) {
  const [busy, setBusy] = useState(false);
  const [appliedVersion, setAppliedVersion] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const pending = useRef<DecisionAction | null>(null);
  const execute = async (
    kind: DecisionAction["kind"],
    proposals: ProposalRevision[],
  ) => {
    if (lock.current || !review.projection) return;
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
      await document.gate.run(async () => {
        if (action.kind === "accept")
          document.adoptSaved(await reviewCommand(action, "document"));
        else await reviewCommand(action, "batch");
      });
      if (kind === "accept") setAppliedVersion(action.decision.expectedHeadId);
      pending.current = null;
      setMessage(
        `${proposals.length}개 제안을 ${kind === "accept" ? "승인" : "거절"}했습니다.`,
      );
      review.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
      review.refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, message, setMessage, execute, appliedVersion };
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
