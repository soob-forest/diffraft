import { useRef, useState } from "react";
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
  const [after, setAfter] = useState(props.proposal.operation.after);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<RevisionRequest | null>(null);
  const saving = useRef(false);
  const save = async () => {
    if (saving.current || props.blocked) return;
    saving.current = true;
    setBusy(true);
    try {
      if (!pending.current || pending.current.after !== after)
        pending.current = {
          documentId: props.projection.batch.documentId,
          batchId: props.projection.batch.id,
          proposalId: props.proposal.id,
          expectedRevision: props.proposal.revision,
          expectedHeadId: props.projection.currentHeadId,
          operationId: crypto.randomUUID(),
          after,
        };
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
  return { after, setAfter, busy, message, save };
}
export function CandidateForm(props: Props) {
  const form = useCandidate(props);
  return (
    <details className="candidate-form">
      <summary>후보 직접 수정 · r{props.proposal.revision}</summary>
      <p className="muted">후보를 저장해도 확정본은 바뀌지 않습니다.</p>
      <form
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
