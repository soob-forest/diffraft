import { useEffect, useRef } from "react";
import { MODEL_LABELS } from "../connection/model";
import type { PendingRequest } from "./request";

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
  const explain = pending.request.mode === "EXPLAIN";
  return (
    <>
      <h2 id="generation-request-title">
        {explain ? "설명 요청 확인" : "수정 제안 요청 확인"}
      </h2>
      <p>
        v{pending.scope.version}의 아래 원문 범위와 이 작업의 목표·고정
        조건·대화·코멘트·최근 결정, 문서 공통 조건을 전달합니다.
      </p>
      <p className="request-model">
        요청 모델: {MODEL_LABELS[pending.request.model]}
      </p>
      <details>
        <summary>
          전달할 원문 ·{" "}
          {new TextEncoder().encode(pending.scope.text).length.toLocaleString()}
          바이트
        </summary>
        <pre>{pending.scope.text || "(빈 문서)"}</pre>
      </details>
      <p className="request-instruction">{pending.request.instruction}</p>
      {pending.request.archivePrevious && (
        <p>
          새 제안 저장에 성공하면 이전 제안을 기록으로 옮깁니다. 이미 승인한
          내용은 확정본에 남습니다.
        </p>
      )}
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
