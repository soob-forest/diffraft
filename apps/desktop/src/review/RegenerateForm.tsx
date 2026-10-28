import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import type { Proposal } from "../generated/Proposal";
import type { RegenerateRequest } from "../generated/RegenerateRequest";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { errorMessage, SCHEMA_VERSION } from "../ipc";

type Props = {
  proposal: Proposal;
  projection: ReviewProjection;
  blocked: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
  prepare: () => Promise<void>;
};
function useRegeneration(props: Props) {
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const submit = async () => {
    if (running.current || props.blocked || !instruction.trim()) return;
    running.current = true;
    setBusy(true);
    props.onBusy(true);
    setMessage("코멘트와 지시를 반영한 새 후보를 요청하고 있습니다.");
    const revision: RegenerateRequest = {
      documentId: props.projection.batch.documentId,
      batchId: props.projection.batch.id,
      proposalId: props.proposal.id,
      expectedRevision: props.proposal.revision,
      expectedHeadId: props.projection.currentHeadId,
      operationId: crypto.randomUUID(),
      instruction,
      retryOf: null,
    };
    try {
      await props.prepare();
      await invoke("regenerate_proposal", {
        request: { schemaVersion: SCHEMA_VERSION },
        revision,
      });
      setMessage("새 후보를 저장했습니다. 비교 후 승인해 주세요.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      running.current = false;
      setBusy(false);
      props.onBusy(false);
      props.onSaved();
    }
  };
  return { instruction, setInstruction, busy, message, submit };
}

export function RegenerateForm(props: Props) {
  const form = useRegeneration(props);
  return (
    <details className="regenerate-form">
      <summary>코멘트 반영·다시 제안</summary>
      <p className="muted">
        이 변경의 원문·후보·코멘트와 아래 지시, 작업 목표·고정 조건·기존
        대화·결정을 전달합니다. 문서 전체를 추가로 보내지 않습니다. 새 후보는
        승인 전까지 확정본에 반영되지 않습니다.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        <label>
          재제안 지시
          <textarea
            rows={3}
            value={form.instruction}
            onChange={(event) => form.setInstruction(event.target.value)}
            disabled={form.busy || props.blocked}
          />
        </label>
        <button
          type="submit"
          disabled={form.busy || props.blocked || !form.instruction.trim()}
        >
          {form.busy ? "재제안 중…" : "재제안 요청"}
        </button>
        <p role="status">{form.message}</p>
      </form>
    </details>
  );
}
