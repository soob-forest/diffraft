import type { ReactNode } from "react";
import { RequestModelSummary } from "../connection/RequestModelSummary";
import { DraftStatus } from "../drafts/SessionDrafts";
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
        <RequestModelSummary />
        <DraftStatus />
        <details>
          <summary aria-label="요청 초안 관리">관리</summary>
          <p>초안은 이 Mac에 보관됩니다. 오래된 요청 대상은 다시 확인합니다.</p>
          <button
            type="button"
            disabled={form.busy || form.locked || !form.instruction}
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
      <RequestKinds form={form} blocked={blocked} />
      {form.mode === "REWRITE" ? (
        <p>
          전체 문서를 참고로 전달하고 새 전체 후보를 만듭니다. 적용은 전체 문서
          단위입니다.
        </p>
      ) : (
        children
      )}
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

function RequestKinds({ form, blocked }: Pick<Props, "form" | "blocked">) {
  return (
    <fieldset className="request-kind" aria-label="요청 종류">
      <button
        type="button"
        aria-pressed={form.mode === "PATCH"}
        disabled={blocked}
        onClick={() => form.setMode("PATCH")}
      >
        부분 수정
      </button>
      <button
        type="button"
        aria-pressed={form.mode === "EXPLAIN"}
        disabled={blocked}
        onClick={() => form.setMode("EXPLAIN")}
      >
        설명
      </button>
      <button
        type="button"
        aria-pressed={form.mode === "REWRITE"}
        disabled={blocked}
        onClick={() => form.setMode("REWRITE")}
      >
        전체 재작성
      </button>
    </fieldset>
  );
}
