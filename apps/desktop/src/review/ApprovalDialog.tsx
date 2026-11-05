import { useEffect, useRef } from "react";
import type { ProposalRevision } from "../generated/ProposalRevision";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { isUnitReview } from "./unit-review-model";

export type Approval = {
  fingerprint: string;
  proposals: ProposalRevision[];
  version: number;
};
type Props = {
  approval: Approval;
  projection: ReviewProjection;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
};
export function ApprovalDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="approval-dialog"
      aria-labelledby="approval-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!props.busy) close.current();
      }}
    >
      <ApprovalContent {...props} />
    </dialog>
  );
}

function ApprovalContent(props: Props) {
  if (isUnitReview(props.projection.batch))
    return (
      <>
        <UnitApproval {...props} />
        <ApprovalButtons {...props} />
      </>
    );
  const excluded =
    props.projection.batch.proposals.length - props.approval.proposals.length;
  return (
    <>
      <h2 id="approval-title">남은 유효 제안 전체 승인</h2>
      <p>
        v{props.approval.version} 확정본에 아래 {props.projection.groups.length}
        개 독립 그룹의 {props.approval.proposals.length}개 제안을 한 번에
        반영합니다. 추가 {props.projection.stats.addedLines}줄 · 삭제{" "}
        {props.projection.stats.removedLines}줄입니다.
      </p>
      <ul>
        {props.approval.proposals.map((target) => {
          const proposal = props.projection.batch.proposals.find(
            (p) => p.id === target.id,
          );
          return (
            <li key={target.id}>
              {proposal?.operation.headingPath.join(" › ") || "문서"} · r
              {target.revision}
              <p>{proposal?.operation.reason}</p>
            </li>
          );
        })}
      </ul>
      <p>이미 처리했거나 유효하지 않은 제안 {excluded}개는 제외됩니다.</p>
      <p className="muted">
        확인 중 문서·제안·생성 상태가 바뀌면 다시 확인해야 합니다.
      </p>
      <ApprovalButtons {...props} label="확인 후 전체 승인" />
    </>
  );
}

function UnitApproval({ projection, approval }: Props) {
  const ids = new Set(approval.proposals.map((proposal) => proposal.id));
  const included = projection.batch.reviewUnits.filter((unit) =>
    unit.proposals.some((proposal) => ids.has(proposal.id)),
  );
  return (
    <>
      <h2 id="approval-title">남은 변경 승인</h2>
      <p>
        v{approval.version} 확정본에 아래 {included.length}개 변경을 반영하고
        바로 저장합니다.
      </p>
      <ul>
        {included.map((unit) => (
          <li key={unit.id}>
            변경 {unit.number} · {unit.title}
            <p>{unit.reason}</p>
          </li>
        ))}
      </ul>
      <p>
        이미 처리했거나 유효하지 않은 변경{" "}
        {projection.batch.reviewUnits.length - included.length}개는 제외됩니다.
      </p>
      <p className="muted">
        확인 중 문서·검토 회차·생성 상태가 바뀌면 다시 확인해야 합니다.
      </p>
    </>
  );
}

function ApprovalButtons(props: Props & { label?: string }) {
  return (
    <div className="dialog-actions">
      <button type="button" disabled={props.busy} onClick={props.onClose}>
        취소
      </button>
      <button
        type="button"
        className="primary"
        disabled={props.busy}
        onClick={props.onApprove}
      >
        {props.label ?? "확인 후 승인·저장"}
      </button>
    </div>
  );
}
