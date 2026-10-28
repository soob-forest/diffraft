import { useEffect, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { BatchDecisionKind } from "../generated/BatchDecisionKind";
import type { BatchDecisionRequest } from "../generated/BatchDecisionRequest";
import { errorMessage } from "../ipc";
import { reviewCommand } from "../review/api";
import { reviewFingerprint } from "../review/state";
import type { ReviewModel } from "../review/useReview";

type Confirmation = {
  decision: BatchDecisionKind;
  request: BatchDecisionRequest;
  fingerprint: string;
};
export function useBatchDecision(
  model: DocumentModel,
  review: ReviewModel,
  externalBlocked: boolean,
) {
  const operation = useBatchOperation(model, review);
  const blocked = Boolean(
    externalBlocked ||
      model.status.dirty ||
      model.status.saving ||
      model.status.error ||
      review.state.generating ||
      review.loading ||
      review.error,
  );
  const selection = useBatchConfirmation(review, operation, blocked);
  return {
    ...selection,
    busy: operation.busy,
    message: operation.message,
    blocked: blocked || operation.busy,
    execute: async () => {
      if (!selection.confirmation || blocked || operation.busy) return;
      if (await operation.execute(selection.confirmation)) selection.close();
    },
  };
}
function useBatchConfirmation(
  review: ReviewModel,
  operation: ReturnType<typeof useBatchOperation>,
  blocked: boolean,
) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const fingerprint = reviewFingerprint(review.projection);
  const { busy, setMessage } = operation;
  useEffect(() => {
    if (
      confirmation &&
      !busy &&
      (blocked || confirmation.fingerprint !== fingerprint)
    ) {
      setConfirmation(null);
      setMessage(
        "문서 또는 후보가 바뀌어 확인을 닫았습니다. 최신 내용을 다시 확인해 주세요.",
      );
    }
  }, [confirmation, busy, blocked, fingerprint, setMessage]);
  return {
    confirmation,
    close: () => setConfirmation(null),
    confirm: (decision: BatchDecisionKind) => {
      const projection = review.projection;
      if (!projection || blocked || busy) return;
      setMessage("");
      setConfirmation({
        decision,
        fingerprint,
        request: {
          documentId: projection.batch.documentId,
          batchId: projection.batch.id,
          expectedHeadId: projection.currentHeadId,
          operationId: crypto.randomUUID(),
        },
      });
    },
  };
}
function useBatchOperation(model: DocumentModel, review: ReviewModel) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const execute = async (confirmation: Confirmation) => {
    setBusy(true);
    try {
      await model.gate.run(() => decide(model, confirmation));
      setMessage(completed[confirmation.decision]);
      review.refresh();
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      review.refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, setMessage, execute };
}

const completed: Record<BatchDecisionKind, string> = {
  apply_rewrite: "전체 재작성안을 새 확정 버전으로 적용했습니다.",
  select_rewrite: "이전 재작성안을 선택했습니다. 확정본은 그대로입니다.",
  discard: "제안을 취소했습니다. 확정본은 그대로이며 후보는 기록에 남습니다.",
};
async function decide(model: DocumentModel, confirmation: Confirmation) {
  await model.autosave.flush();
  const action = {
    kind: "batch_decision" as const,
    decision: confirmation.decision,
    request: confirmation.request,
  };
  if (confirmation.decision === "apply_rewrite") {
    model.adoptSaved(await reviewCommand(action, "document"));
  } else {
    await reviewCommand(action, "batch");
  }
}
