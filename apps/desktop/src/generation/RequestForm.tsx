import type { ReactNode } from "react";
import type { useGeneration } from "./useGeneration";

type Props = {
  form: ReturnType<typeof useGeneration>;
  blocked: boolean;
  children: ReactNode;
};
export function RequestForm({ form, blocked, children }: Props) {
  return (
    <form
      className="request-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.prepare();
      }}
    >
      <RequestFields form={form} blocked={blocked}>
        {children}
      </RequestFields>
      <div className="request-draft-note">
        <span>요청 초안 · 이 세션에서 보존</span>
        <details>
          <summary aria-label="요청 초안 관리">관리</summary>
          <p>앱을 닫으면 미전송 초안은 사라집니다.</p>
          <button
            type="button"
            disabled={form.busy || !form.instruction}
            onClick={() => form.setInstruction("")}
          >
            요청 초안 비우기
          </button>
        </details>
      </div>
      <div className="request-actions">
        <button type="submit" disabled={blocked || !form.instruction.trim()}>
          요청 내용 확인
        </button>
      </div>
    </form>
  );
}

function RequestFields({ form, blocked, children }: Props) {
  return (
    <>
      <fieldset className="request-kind" aria-label="요청 종류">
        <button
          type="button"
          aria-pressed={form.mode === "PATCH"}
          disabled={blocked}
          onClick={() => form.setMode("PATCH")}
        >
          수정 제안
        </button>
        <button
          type="button"
          aria-pressed={form.mode === "EXPLAIN"}
          disabled={blocked}
          onClick={() => form.setMode("EXPLAIN")}
        >
          설명만
        </button>
      </fieldset>
      {children}
      <label>
        이번 요청
        <textarea
          rows={3}
          value={form.instruction}
          disabled={blocked}
          required
          onChange={(event) => form.setInstruction(event.target.value)}
          placeholder="예: 수치를 유지하고 간결하게 다듬어 주세요."
        />
      </label>
    </>
  );
}
