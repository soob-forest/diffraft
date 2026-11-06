import { useRef, useState } from "react";
import { DraftLocked } from "../drafts/DraftRecovery";
import { useSessionDraft } from "../drafts/SessionDrafts";
import type { Proposal } from "../generated/Proposal";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { RevisionRequest } from "../generated/RevisionRequest";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";

type Props = {
  proposal: Proposal;
  projection: ReviewProjection;
  blocked: boolean;
  onSaved: () => void;
};
function useCandidate(props: Props) {
  const draft = useSessionDraft(
    JSON.stringify([
      "candidate",
      props.projection.batch.documentId,
      props.projection.batch.taskId,
      props.projection.batch.id,
      props.proposal.id,
      String(props.proposal.revision),
    ]),
    { after: props.proposal.operation.after },
  );
  const after = draft.value.after;
  const setAfter = (after: string) => draft.set({ after });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<RevisionRequest | null>(null);
  const saving = useRef(false);
  const save = async () => {
    if (saving.current || props.blocked || draft.locked) return;
    saving.current = true;
    setBusy(true);
    try {
      await draft.flush();
      if (!pending.current || pending.current.after !== after)
        pending.current = candidateRevision(props, after);
      await reviewCommand(
        { kind: "revise", revision: pending.current },
        "batch",
      );
      pending.current = null;
      setMessage("새 후보를 저장했습니다. 승인하면 확정본에 반영됩니다.");
      props.onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return { after, setAfter, busy, message, save, locked: draft.locked };
}
function candidateRevision(props: Props, after: string): RevisionRequest {
  return {
    documentId: props.projection.batch.documentId,
    batchId: props.projection.batch.id,
    proposalId: props.proposal.id,
    expectedRevision: props.proposal.revision,
    expectedHeadId: props.projection.currentHeadId,
    operationId: crypto.randomUUID(),
    after,
  };
}
export function CandidateForm(props: Props) {
  const form = useCandidate(props);
  return (
    <details className="candidate-form">
      <summary>
        후보 직접 수정
        {props.proposal.revision > 1
          ? ` · 수정안 ${props.proposal.revision}`
          : ""}
      </summary>
      <p className="muted">후보를 저장해도 확정본은 바뀌지 않습니다.</p>
      <DraftLocked locked={form.locked} />
      <form
        inert={form.locked}
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
      >
        <label>
          새 후보 내용
          <textarea
            rows={5}
            value={form.after}
            onChange={(event) => form.setAfter(event.target.value)}
            disabled={form.busy || props.blocked}
          />
        </label>
        <button
          type="submit"
          disabled={
            form.busy ||
            props.blocked ||
            form.after === props.proposal.operation.after
          }
        >
          후보 저장
        </button>
        <p role="status">{form.message}</p>
      </form>
    </details>
  );
}
