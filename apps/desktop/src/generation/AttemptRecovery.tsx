import type { GenerationAttempt } from "../generated/GenerationAttempt";
import { QuotePreview } from "../review/QuotePreview";
import { failureLabel } from "./failure-label";

type Props = {
  attempt: GenerationAttempt | null;
  blocked: boolean;
  retry: (attempt: GenerationAttempt) => void;
  edit: (attempt: GenerationAttempt) => void;
};
export function AttemptRecovery(props: Props) {
  const attempt = props.attempt;
  if (!attempt || !["FAILED", "CANCELLED"].includes(attempt.status))
    return null;
  return (
    <section className="attempt-recovery" aria-label="실패한 요청 회복">
      <div className="attempt-failure">
        <strong>
          마지막 요청 {attempt.status === "CANCELLED" ? "중단됨" : "실패"}
        </strong>
        <p>{failureLabel(attempt.errorCode)}</p>
        <p>원문과 이전 제안은 유지했습니다.</p>
      </div>
      <p className="attempt-request-label">지난 요청</p>
      <QuotePreview
        text={attempt.request.value.instruction}
        label="지난 요청 내용"
      />
      <button
        type="button"
        disabled={props.blocked}
        onClick={() => props.retry(attempt)}
      >
        마지막 요청 다시 실행
      </button>
      <button
        type="button"
        className="primary"
        disabled={props.blocked}
        onClick={() => props.edit(attempt)}
      >
        내용을 수정해 새로 요청
      </button>
      <p>
        새 요청은 최신 원문과 범위를 다시 확인합니다. 기존 초안이 있으면
        덮어쓰기 전에 선택합니다. 재시도는 사용 한도를 다시 소비할 수 있습니다.
      </p>
    </section>
  );
}
