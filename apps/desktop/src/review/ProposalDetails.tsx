import { type ReactNode, useEffect, useRef } from "react";
import type { Proposal } from "../generated/Proposal";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { CandidateForm } from "./CandidateForm";
import { CommentForm } from "./CommentForm";
import { QuotePreview } from "./QuotePreview";
import { quotePreviewOffset } from "./quote-context";
import { RegenerateForm } from "./RegenerateForm";
import type { Panel } from "./useReviewPanel";

type Props = { panel: Panel; projection: ReviewProjection; conditions: string };
export function ProposalDetails(props: Props) {
  useDetailReturn(props);
  const group = props.panel.selected;
  if (!group) return null;
  const proposals = props.projection.batch.proposals.filter((proposal) =>
    group.proposals.some((value) => value.id === proposal.id),
  );
  return (
    <section
      className="proposal-details"
      aria-label="선택한 변경"
      data-view={props.panel.detail.kind}
    >
      {props.panel.detail.kind === "summary" && <h3>선택한 변경</h3>}
      {proposals.map((proposal) => (
        <ProposalCard
          key={`${proposal.id}:${proposal.revision}`}
          {...props}
          proposal={proposal}
        />
      ))}
      {props.panel.detail.kind === "summary" && (
        <div className="task-continuation">
          <strong>현재 작업 이어가기</strong>
          <p>위의 ‘작업·대화’에서 조건과 AI 요청을 열 수 있습니다.</p>
        </div>
      )}
    </section>
  );
}

function ProposalCard(props: Props & { proposal: Proposal }) {
  const { panel, proposal, projection } = props;
  const active = panel.detail.proposalId === proposal.id;
  const formProps = {
    proposal,
    projection,
    blocked: panel.blocked,
    onSaved: panel.review.refresh,
  };
  return (
    <article className="proposal-card" data-proposal-id={proposal.id}>
      {panel.detail.kind === "summary" && <ProposalSummary {...props} />}
      <CommentForm
        {...formProps}
        selection={panel.selection}
        active={active && panel.detail.kind === "comment"}
        onBack={() => panel.openDetail("summary", proposal.id)}
        onNext={() => panel.openDetail("regenerate", proposal.id)}
      />
      <ProposalWorkflow
        active={active && panel.detail.kind === "candidate"}
        onBack={() => panel.openDetail("summary", proposal.id)}
      >
        <CandidateForm {...formProps} />
      </ProposalWorkflow>
      <ProposalWorkflow
        active={active && panel.detail.kind === "regenerate"}
        onBack={() => panel.openDetail("summary", proposal.id)}
      >
        <RegenerateForm
          {...formProps}
          onBusy={panel.setRegenerating}
          prepare={panel.prepareGeneration}
        />
      </ProposalWorkflow>
    </article>
  );
}

function ProposalSummary({
  panel,
  proposal,
  conditions,
}: Props & { proposal: Proposal }) {
  return (
    <div className="proposal-summary">
      <strong>{proposal.operation.headingPath.at(-1) || "문서"}</strong>
      <p className="proposal-reason">
        {panel.selected?.proposals.length === 1
          ? "독립 승인 그룹 1개"
          : `함께 승인하는 제안 ${panel.selected?.proposals.length}개`}{" "}
        · {proposal.operation.reason} · r{proposal.revision}
      </p>
      <div className="review-conditions">
        <strong>유지할 조건</strong>
        <p>{conditions || "고정 조건 없음"}</p>
      </div>
      <QuotePreview
        text={proposal.operation.after}
        label="선택한 제안 내용"
        focusOffset={quotePreviewOffset(
          proposal.operation.after,
          proposal.operation.before,
          proposal.operation.after,
        )}
      />
      <button
        type="button"
        className="comment-entry"
        onClick={() => panel.openDetail("comment", proposal.id)}
      >
        코멘트 작성
      </button>
      <div className="proposal-secondary">
        <button
          type="button"
          onClick={() => panel.openDetail("candidate", proposal.id)}
        >
          직접 후보 수정
        </button>
        <button
          type="button"
          onClick={() => panel.openDetail("regenerate", proposal.id)}
        >
          이 변경 다시 제안
        </button>
      </div>
    </div>
  );
}

function ProposalWorkflow({
  active,
  onBack,
  children,
}: {
  active: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const details = root.current?.querySelector("details");
    if (details) details.open = true;
    requestAnimationFrame(() =>
      root.current?.querySelector("textarea")?.focus(),
    );
  }, [active]);
  return (
    <div ref={root} hidden={!active} className="proposal-workflow">
      <button type="button" className="workflow-back" onClick={onBack}>
        변경 상세로 돌아가기
      </button>
      {children}
    </div>
  );
}

function useDetailReturn({ panel }: Props) {
  const previous = useRef(panel.detail.kind);
  useEffect(() => {
    const returning =
      previous.current !== "summary" && panel.detail.kind === "summary";
    previous.current = panel.detail.kind;
    if (!returning) return;
    const frame = requestAnimationFrame(() => {
      const cards = document.querySelectorAll<HTMLElement>(".proposal-card");
      [...cards]
        .find((card) => card.dataset.proposalId === panel.detail.proposalId)
        ?.querySelector<HTMLButtonElement>(".comment-entry")
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [panel.detail.kind, panel.detail.proposalId]);
}
