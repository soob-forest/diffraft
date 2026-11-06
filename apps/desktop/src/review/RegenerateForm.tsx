import { modelLabel } from "../connection/provider";
import { DraftLocked } from "../drafts/DraftRecovery";
import { type RegenerationProps, useRegeneration } from "./useRegeneration";

export function RegenerateForm(props: RegenerationProps) {
  const form = useRegeneration(props);
  return (
    <details className="regenerate-form">
      <summary>이 변경 더 고치기</summary>
      <strong className="regenerate-target">
        대상 · {props.proposal.operation.headingPath.at(-1) || "문서"}의 수정안
        {props.proposal.revision > 1 ? ` ${props.proposal.revision}` : ""}
      </strong>
      <p className="muted">
        이 변경의 원문·수정안·코멘트와 이번 요청, 계속 참고할 방향·유지할
        조건·기존 대화·결정을 전달합니다. 문서 전체를 추가로 보내지 않습니다. 새
        후보는 승인 전까지 확정본에 반영되지 않습니다.
      </p>
      <DraftLocked locked={form.locked} />
      <form
        inert={form.locked}
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        <label>
          이번 요청
          <textarea
            rows={3}
            value={form.instruction}
            onChange={(event) => form.setInstruction(event.target.value)}
            disabled={form.busy || props.blocked}
          />
        </label>
        <RegenerationActions form={form} blocked={props.blocked} />
        <p role="status">{form.message}</p>
      </form>
    </details>
  );
}

function RegenerationActions({
  form,
  blocked,
}: {
  form: ReturnType<typeof useRegeneration>;
  blocked: boolean;
}) {
  return (
    <>
      {form.pending && (
        <p className="request-model">
          요청 공급자 / 모델: {modelLabel(form.pending.model)} · 사용 한도를
          소비할 수 있습니다.
        </p>
      )}
      <button
        type="submit"
        disabled={form.busy || blocked || !form.instruction.trim()}
      >
        {form.busy
          ? "요청 중…"
          : form.pending
            ? "확인 후 요청"
            : "요청 내용 확인"}
      </button>
      {form.pending && (
        <button type="button" disabled={form.busy} onClick={form.cancel}>
          요청 취소
        </button>
      )}
    </>
  );
}
