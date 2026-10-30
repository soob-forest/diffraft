import { MODEL_LABELS } from "../connection/model";
import { type RegenerationProps, useRegeneration } from "./useRegeneration";

export function RegenerateForm(props: RegenerationProps) {
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
          요청 모델: {MODEL_LABELS[form.pending.model]} · 사용 한도를 소비할 수
          있습니다.
        </p>
      )}
      <button
        type="submit"
        disabled={form.busy || blocked || !form.instruction.trim()}
      >
        {form.busy
          ? "재제안 중…"
          : form.pending
            ? "확인 후 재제안"
            : "재제안 요청"}
      </button>
      {form.pending && (
        <button type="button" disabled={form.busy} onClick={form.cancel}>
          요청 취소
        </button>
      )}
    </>
  );
}
