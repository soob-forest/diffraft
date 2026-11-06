import { ScopeBar } from "../editor/ScopeBar";
import type { BatchSummary } from "../generated/BatchSummary";
import { QuestionTarget } from "./QuestionTarget";
import { RequestForm } from "./RequestForm";
import type { GenerationProps } from "./request";
import type { useGeneration } from "./useGeneration";
export function RequestInput({
  props,
  form,
  blocked,
  active,
  referenceLabel,
}: {
  props: GenerationProps;
  form: ReturnType<typeof useGeneration>;
  blocked: boolean;
  active: BatchSummary | undefined;
  referenceLabel?: string;
}) {
  return (
    <RequestForm form={form} blocked={blocked}>
      {form.mode === "REWRITE" ? (
        <strong>
          대상 · 확정본 전체 · v{props.model.status.version}
          {referenceLabel ? ` · 참고 후보: ${referenceLabel}` : ""}
        </strong>
      ) : form.question ? (
        <QuestionTarget question={form.question} />
      ) : (
        <ScopeBar model={props.model} requestScope={props.scope} />
      )}
      <p className="request-effects">
        {form.mode === "EXPLAIN"
          ? "답변만 대화에 저장합니다. 문서와 제안의 결정은 바꾸지 않습니다."
          : form.mode === "PATCH"
            ? active
              ? "새 제안 저장에 성공하면 이전 미승인 제안을 기록으로 옮깁니다. 승인한 내용은 확정본에 남습니다."
              : "새 제안은 승인 전까지 확정본에 반영되지 않습니다."
            : active?.reviewMode === "CHANGES"
              ? "요청 시작 시 이전 미승인 제안을 기록으로 옮깁니다. 승인한 내용은 확정본에 남습니다."
              : "확정본 전체에서 새 전체 후보를 만듭니다."}
      </p>
    </RequestForm>
  );
}
