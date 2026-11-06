import type { ReactNode } from "react";
import { RequestModelSummary } from "../connection/RequestModelSummary";
import { DraftStatus } from "../drafts/SessionDrafts";
import type { useGeneration } from "./useGeneration";

type Props = {
  form: RequestFormModel;
  blocked: boolean;
  children: ReactNode;
};
export type RequestFormModel = Pick<
  ReturnType<typeof useGeneration>,
  | "mode"
  | "instruction"
  | "busy"
  | "locked"
  | "prepare"
  | "setMode"
  | "setInstruction"
  | "editMode"
  | "question"
  | "referenceBatchId"
>;
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
        <p>새 전체 초안을 만듭니다. 전체 적용 또는 변경별 검토가 가능합니다.</p>
      ) : null}
      {children}
      <label>
        이번 요청
        <textarea
          rows={3}
          value={form.instruction}
          disabled={blocked}
          required
          onChange={(event) => form.setInstruction(event.target.value)}
          placeholder={
            form.mode === "EXPLAIN"
              ? "예: 이 표현을 사용한 이유는?"
              : "예: 수치를 유지하고 짧게 다듬어 주세요."
          }
        />
      </label>
    </>
  );
}

function RequestKinds({ form, blocked }: Pick<Props, "form" | "blocked">) {
  return (
    <>
      <fieldset className="request-kind" aria-label="요청 목적">
        <button
          type="button"
          aria-pressed={form.mode !== "EXPLAIN"}
          disabled={blocked || Boolean(form.question)}
          onClick={() =>
            form.setMode(
              form.mode === "EXPLAIN" ? (form.editMode ?? "PATCH") : form.mode,
            )
          }
        >
          수정 제안 받기
        </button>
        <button
          type="button"
          aria-pressed={form.mode === "EXPLAIN"}
          disabled={blocked}
          onClick={() => form.setMode("EXPLAIN")}
        >
          질문하기
        </button>
      </fieldset>
      {form.mode !== "EXPLAIN" && (
        <label>
          수정 방식
          <select
            aria-label="수정 방식"
            disabled={blocked}
            value={form.mode}
            onChange={(event) =>
              form.setMode(event.target.value as "PATCH" | "REWRITE")
            }
          >
            <option value="PATCH">기존 문장 다듬기</option>
            <option value="REWRITE">새 전체 초안 만들기</option>
          </select>
        </label>
      )}
    </>
  );
}
