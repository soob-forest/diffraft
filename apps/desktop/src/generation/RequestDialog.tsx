import { useEffect, useRef } from "react";
import { modelLabel } from "../connection/provider";
import { QuestionTarget } from "./QuestionTarget";
import type { PendingRequest } from "./request";
import { requestLabels, requestTargetLabel } from "./request-labels";

type Props = {
  pending: PendingRequest;
  busy: boolean;
  close: () => void;
  generate: () => void;
};
export function RequestDialog(props: Props) {
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
      className="generation-dialog"
      aria-labelledby="generation-request-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!props.busy) props.close();
      }}
    >
      <RequestContent {...props} />
    </dialog>
  );
}

function RequestContent({ pending, busy, close, generate }: Props) {
  const explain =
    pending.kind === "generate" && pending.request.mode === "EXPLAIN";
  const rewrite = pending.kind === "rewrite";
  return (
    <>
      <h2 id="generation-request-title">
        {
          requestLabels[
            pending.kind === "rewrite" ? "REWRITE" : pending.request.mode
          ]
        }{" "}
        · 요청 확인
      </h2>
      <p>
        v{pending.scope.version} 기준 아래 대상과 이 작업에서 계속 참고할
        방향·유지할 조건·대화·코멘트·최근 결정, 문서 공통 조건을 전달합니다.
      </p>
      <p className="request-model">
        요청 공급자 / 모델: {modelLabel(pending.request.model)}
      </p>
      <RequestTarget pending={pending} />
      <p className="request-instruction">{pending.request.instruction}</p>
      <RequestEffects pending={pending} rewrite={rewrite} />
      <p>
        {explain
          ? "답변은 대화에만 저장합니다."
          : "새 제안은 승인 전까지 확정본에 반영되지 않습니다."}{" "}
        사용 한도를 소비할 수 있습니다.
      </p>
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={close}>
          요청 취소
        </button>
        <button type="button" disabled={busy} onClick={generate}>
          확인 후 요청
        </button>
      </div>
    </>
  );
}

function RequestEffects({
  pending,
  rewrite,
}: Pick<Props, "pending"> & { rewrite: boolean }) {
  return (
    <>
      {pending.kind === "generate" && pending.request.archivePrevious && (
        <p>
          새 제안 저장에 성공하면 이전 제안을 기록으로 옮깁니다. 이미 승인한
          내용은 확정본에 남습니다.
        </p>
      )}
      {pending.kind === "rewrite" && pending.request.archivePatch && (
        <p>
          요청을 시작하면 이전 부분 제안을 기록으로 옮깁니다. 이미 승인한 내용은
          확정본에 남습니다.
        </p>
      )}
      {pending.kind === "rewrite" && pending.request.referenceBatchId && (
        <p>참고 후보 · {pending.referenceLabel ?? "선택한 전체 후보"}</p>
      )}
      {rewrite && (
        <p>
          수정 범위는 전체 문서이며, 새 후보는 전체 적용 또는 변경별 검토가
          가능합니다.
        </p>
      )}
    </>
  );
}

function RequestTarget({ pending }: Pick<Props, "pending">) {
  return pending.kind === "generate" && pending.request.question ? (
    <QuestionTarget question={pending.request.question} />
  ) : (
    <section aria-label="확인할 요청 대상">
      <strong>요청 대상 · {requestTargetLabel(pending)}</strong>
      <details>
        <summary>
          전달할 원문 ·{" "}
          {new TextEncoder().encode(pending.scope.text).length.toLocaleString()}
          바이트
        </summary>
        <pre>{pending.scope.text || "(빈 문서)"}</pre>
      </details>
    </section>
  );
}
