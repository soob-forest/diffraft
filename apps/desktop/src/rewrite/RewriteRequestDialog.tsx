import { useEffect, useRef } from "react";
import { MODEL_LABELS } from "../connection/model";
import type { useRewriteGeneration } from "./useRewriteGeneration";

type Props = { form: ReturnType<typeof useRewriteGeneration>; version: number };
export function RewriteRequestDialog({ form, version }: Props) {
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
      className="approval-dialog rewrite-request-dialog"
      aria-labelledby="rewrite-request-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!form.busy) form.close();
      }}
    >
      <RequestContent form={form} version={version} />
    </dialog>
  );
}

function RequestContent({ form, version }: Props) {
  return (
    <>
      <h2 id="rewrite-request-title">문서 전체 재작성 요청</h2>
      <p>
        v{version} 확정본 전체를 기준으로 새 후보를 요청합니다. 생성된 후보는
        전체 적용 전까지 확정본에 반영되지 않습니다.
      </p>
      <p className="request-model">
        요청 모델: {MODEL_LABELS[form.pending?.model ?? "cli_default"]}
      </p>
      {form.pending?.archivePatch && (
        <p>
          이전 부분 제안 묶음을 기록으로 옮깁니다. 이미 승인한 내용은 확정본에
          유지합니다.
        </p>
      )}
      {form.pending?.referenceBatchId && (
        <p>
          보고 있던 재작성 후보와 그 기준본을 함께 전달해 다른 방향을
          요청합니다.
        </p>
      )}
      {form.message && <p role="alert">{form.message}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={form.busy} onClick={form.close}>
          요청 취소
        </button>
        <button
          type="button"
          className="primary"
          disabled={form.blocked}
          onClick={() => void form.generate()}
        >
          {form.busy
            ? "재작성 중…"
            : form.pending?.archivePatch
              ? "기록으로 옮기고 재작성"
              : "확인 후 재작성"}
        </button>
      </div>
    </>
  );
}
