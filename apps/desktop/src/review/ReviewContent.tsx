import type { Proposal } from "../generated/Proposal";
import type { ReviewModel } from "./useReview";

export { ProposalDetails } from "./ProposalDetails";
export function ReviewHeader({ review }: { review: ReviewModel }) {
  return (
    <header className="review-header">
      {review.state.batches.length > 0 && (
        <label>
          <span className="visually-hidden">제안 기록</span>
          <select
            value={review.projection?.batch.id ?? ""}
            onChange={(event) => review.setBatchId(event.target.value)}
          >
            {review.state.batches.map((batch, index) => (
              <option key={batch.id} value={batch.id}>
                {batch.status === "ACTIVE" ? "현재" : "이전"} 제안{" "}
                {review.state.batches.length - index} · {batch.summary}
              </option>
            ))}
          </select>
        </label>
      )}
      {review.state.generating && (
        <span role="status">생성 중 · 승인 잠김</span>
      )}
    </header>
  );
}
export function Processed({ proposals }: { proposals: Proposal[] }) {
  if (!proposals.length) return null;
  return (
    <details className="processed">
      <summary>처리·이전 기록 · {proposals.length}개</summary>
      {proposals.map((proposal) => (
        <article key={proposal.id}>
          <h3>
            {proposal.decision === "ACCEPTED"
              ? "승인됨"
              : proposal.decision === "REJECTED"
                ? "거절됨"
                : proposal.validity !== "VALID"
                  ? "원문 변경으로 재검토 필요"
                  : "이전 제안"}{" "}
            · r{proposal.revision}
          </h3>
          <p>{proposal.operation.reason}</p>
          <strong>당시 변경 전</strong>
          <pre>{proposal.operation.before}</pre>
          <strong>당시 변경 후</strong>
          <pre>{proposal.operation.after}</pre>
        </article>
      ))}
    </details>
  );
}
