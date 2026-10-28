import { useEffect, useRef } from "react";
import type { Proposal } from "../generated/Proposal";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { CandidateForm } from "./CandidateForm";
import { CommentForm } from "./CommentForm";
import { RegenerateForm } from "./RegenerateForm";
import type { ReviewModel } from "./useReview";
import type { Panel } from "./useReviewPanel";
export function ReviewHeader({ review }: { review: ReviewModel }) {
  return (
    <header className="review-header">
      <h2>변경 검토</h2>
      {review.state.batches.length > 0 && (
        <label>
          제안 기록
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
export function GroupBar({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <div className="group-bar">
      <strong data-testid="diff-stats">
        +{projection.stats.addedLines} / −{projection.stats.removedLines}
      </strong>
      <span>{projection.groups.length}개 변경 그룹</span>
      <GroupNavigation panel={panel} projection={projection} />
      <button
        type="button"
        disabled={!projection.groups.length}
        onClick={() => panel.move(-1)}
      >
        이전 변경
      </button>
      <button
        type="button"
        disabled={!projection.groups.length}
        onClick={() => panel.move(1)}
      >
        다음 변경
      </button>
      <button
        type="button"
        disabled={panel.blocked || !projection.groups.length}
        onClick={panel.confirm}
      >
        남은 제안 전체 승인
      </button>
      <GroupCompletion remaining={projection.groups.length} />
    </div>
  );
}
function GroupCompletion({ remaining }: { remaining: number }) {
  const status = useRef<HTMLParagraphElement>(null);
  const hadPending = useRef(remaining > 0);
  useEffect(() => {
    if (hadPending.current && !remaining) status.current?.focus();
    hadPending.current = remaining > 0;
  }, [remaining]);
  return remaining ? null : (
    <p role="status" ref={status} tabIndex={-1}>
      유효한 미처리 변경이 없습니다. 아래 처리 기록을 확인할 수 있습니다.
    </p>
  );
}
export function ProposalDetails({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  const group = panel.selected;
  if (!group) return null;
  const proposals = projection.batch.proposals.filter((p) =>
    group.proposals.some((r) => r.id === p.id),
  );
  return (
    <section className="proposal-details" aria-label="선택한 변경">
      <div className="proposal-actions">
        <button
          type="button"
          disabled={panel.blocked}
          onClick={() => {
            void panel.actions.execute("accept", group.proposals);
          }}
        >
          선택한 변경 승인
        </button>
        <button
          type="button"
          disabled={panel.blocked}
          onClick={() => {
            void panel.actions.execute("reject", group.proposals);
          }}
        >
          선택한 변경 거절
        </button>
      </div>
      <ProposalCards
        proposals={proposals}
        panel={panel}
        projection={projection}
      />
    </section>
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

function GroupNavigation({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <nav aria-label="변경 그룹">
      {projection.groups.map((group, index) => (
        <button
          type="button"
          key={group.id}
          aria-pressed={panel.selected?.id === group.id}
          onClick={() => panel.choose(group)}
        >
          {index + 1}번 변경
          {group.proposals.length > 1
            ? ` · ${group.proposals.length}개 결합`
            : ""}
        </button>
      ))}
    </nav>
  );
}

function ProposalCards({
  proposals,
  panel,
  projection,
}: {
  proposals: Proposal[];
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <>
      {proposals.map((proposal) => (
        <article key={`${proposal.id}:${proposal.revision}`}>
          <h3>
            {proposal.operation.headingPath.join(" › ") || "문서"} · r
            {proposal.revision}
          </h3>
          <p>{proposal.operation.reason}</p>
          <CandidateForm
            proposal={proposal}
            projection={projection}
            blocked={panel.blocked}
            onSaved={panel.review.refresh}
          />
          <CommentForm
            proposal={proposal}
            projection={projection}
            selection={panel.selection}
            onSaved={panel.review.refresh}
          />
          <RegenerateForm
            proposal={proposal}
            projection={projection}
            blocked={panel.blocked}
            onBusy={panel.setRegenerating}
            prepare={panel.prepareGeneration}
            onSaved={panel.review.refresh}
          />
        </article>
      ))}
    </>
  );
}
