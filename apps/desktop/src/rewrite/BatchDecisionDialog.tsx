import { useEffect, useRef } from "react";
import type { BatchDecisionKind } from "../generated/BatchDecisionKind";
import type { useBatchDecision } from "./useBatchDecision";

type Props = { actions: ReturnType<typeof useBatchDecision>; version: number };
const labels: Record<
  BatchDecisionKind,
  { title: string; action: string; description: string }
> = {
  apply_rewrite: {
    title: "전체 재작성안 적용",
    action: "확인 후 전체 적용",
    description:
      "후보 전체를 새 확정 버전으로 저장합니다. 이전 확정본은 버전 기록에 남으며, 구간별로 적용하지 않습니다.",
  },
  select_rewrite: {
    title: "이전 재작성안 선택",
    action: "이 안 선택",
    description:
      "현재 제안은 기록으로 옮기고 보고 있는 후보를 선택합니다. 확정본 파일은 바뀌지 않습니다.",
  },
  discard: {
    title: "제안 취소",
    action: "확인 후 제안 취소",
    description:
      "이 묶음의 미승인 제안을 취소합니다. 이미 승인한 내용과 확정본은 그대로 유지하며, 취소한 후보는 기록으로만 확인할 수 있습니다.",
  },
};
export function BatchDecisionDialog({ actions, version }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
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
      className="approval-dialog batch-decision-dialog"
      aria-labelledby="batch-decision-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!actions.busy) actions.close();
      }}
    >
      <DecisionContent actions={actions} version={version} />
    </dialog>
  );
}

function DecisionContent({ actions, version }: Props) {
  const decision = actions.confirmation?.decision;
  if (!decision) return null;
  const label = labels[decision];
  return (
    <>
      <h2 id="batch-decision-title">{label.title}</h2>
      <p>
        현재 확정본 v{version}
        {decision === "apply_rewrite" ? ` → 새 v${version + 1}` : " 유지"}
      </p>
      <p>{label.description}</p>
      {actions.message && <p role="alert">{actions.message}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={actions.busy} onClick={actions.close}>
          돌아가기
        </button>
        <button
          type="button"
          className="primary"
          disabled={actions.blocked}
          onClick={() => void actions.execute()}
        >
          {label.action}
        </button>
      </div>
    </>
  );
}
