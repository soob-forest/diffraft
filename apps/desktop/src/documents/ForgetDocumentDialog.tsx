import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { DocumentSummary } from "../generated/DocumentSummary";

type Props = {
  document: DocumentSummary;
  busy: boolean;
  confirm: () => void;
  cancel: () => void;
  error: string;
};
export function ForgetDocumentDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    node?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => node?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="forget-document-dialog"
      aria-labelledby="forget-title"
      aria-describedby="forget-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!props.busy) props.cancel();
      }}
    >
      <h2 id="forget-title">목록에서 완전히 제거할까요?</h2>
      <p className="forget-document-name">{props.document.title}</p>
      <p id="forget-description">
        일반 목록과 완료 목록에서 더 이상 표시하지 않습니다. 파일과 작업 이력은
        남습니다. 다시 사용하려면 ‘문서 열기’에서 같은 파일을 선택하세요.
      </p>
      {props.error && <p role="alert">{props.error}</p>}
      <ForgetActions {...props} />
    </dialog>,
    document.body,
  );
}

function ForgetActions(props: Props) {
  return (
    <div className="forget-document-actions">
      <button type="button" disabled={props.busy} onClick={props.cancel}>
        취소
      </button>
      <button
        type="button"
        className="danger"
        disabled={props.busy}
        onClick={props.confirm}
      >
        {props.busy ? "입력 저장 중…" : "목록에서 완전히 제거"}
      </button>
    </div>
  );
}
