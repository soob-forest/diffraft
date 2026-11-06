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
export function Processed({
  proposals,
  open,
  batchStatus = "ACTIVE",
}: {
  proposals: Proposal[];
  batchStatus?: string;
  open: (proposal: Proposal) => void;
}) {
  if (!proposals.length) return null;
  return (
    <details className="processed">
      <summary>처리 기록 · {proposals.length}개</summary>
      {proposals.map((proposal) => (
        <article key={proposal.id}>
          <h3>
            {proposal.decision === "ACCEPTED"
              ? "승인됨"
              : proposal.decision === "REJECTED"
                ? "거절됨"
                : batchStatus !== "ACTIVE"
                  ? "이전 제안"
                  : proposal.validity !== "VALID"
                    ? "원문 변경으로 재검토 필요"
                    : "이전 제안"}{" "}
            · {proposal.operation.headingPath.at(-1) || "문서"}
            {proposal.revision > 1 ? ` · 수정안 ${proposal.revision}` : ""}
          </h3>
          <p>{proposal.operation.reason}</p>
          <button type="button" onClick={() => open(proposal)}>
            당시 변경 비교
          </button>
        </article>
      ))}
    </details>
  );
}
