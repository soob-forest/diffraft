import { useEffect, useRef } from "react";
import type { DocumentModel } from "../editor/useDocument";
import { DiffViewer } from "../review/DiffViewer";
import { RecoveryCopies } from "./RecoveryCopies";
import { useConflict } from "./useConflict";
import "./conflict.css";

export function ConflictDialog({
  model,
  onClose,
}: {
  model: DocumentModel;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const state = useConflict(model, onClose);
  useDialog(dialog);
  return (
    <dialog
      ref={dialog}
      className="approval-dialog conflict-dialog"
      aria-labelledby="conflict-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!state.busy) onClose();
      }}
    >
      <h2 id="conflict-title">앱 내용과 외부 파일 비교</h2>
      <p>
        − 앱 내용 · + 외부 파일. 반영 전에 현재 앱 내용은 복구용으로 보존합니다.
      </p>
      {state.message && (
        <p role="status" className="review-message">
          {state.message}
        </p>
      )}
      <ConflictBody state={state} model={model} />
      <ConflictActions state={state} onClose={onClose} />
    </dialog>
  );
}

function ConflictBody({
  state,
  model,
}: {
  state: ReturnType<typeof useConflict>;
  model: DocumentModel;
}) {
  const view = state.view;
  if (!view) return <p>비교 내용을 불러오는 중…</p>;
  const recovery = view.document.status === "RECOVERY_REQUIRED";
  const blocked = state.busy || recovery || !view.diskHash;
  return (
    <>
      <ConflictComparisonView state={state} />
      {recovery && (
        <p role="alert">
          미완료 저장을 먼저 복구해 주세요.{" "}
          <button
            type="button"
            disabled={state.busy}
            onClick={() => void state.recover()}
          >
            저장 복구 실행
          </button>
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          disabled={blocked}
          onClick={() => void state.resolve({ kind: "external" })}
        >
          외부 파일 사용
        </button>
      </div>
      <MergeForm state={state} blocked={blocked} />
      <RecoveryCopies
        documentId={model.state.document.id}
        copies={view.recoveryCopies}
        onUse={state.setDraft}
      />
    </>
  );
}

function useDialog(dialog: React.RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [dialog]);
}

function ConflictActions({
  state,
  onClose,
}: {
  state: ReturnType<typeof useConflict>;
  onClose: () => void;
}) {
  return (
    <div className="dialog-actions">
      <button
        type="button"
        disabled={state.busy}
        onClick={() => void state.refresh()}
      >
        파일 다시 확인
      </button>
      <button
        type="button"
        disabled={state.busy}
        onClick={() => void state.copy()}
      >
        앱 내용 사본 저장
      </button>
      <button type="button" disabled={state.busy} onClick={onClose}>
        닫기
      </button>
    </div>
  );
}

function MergeForm({
  state,
  blocked,
}: {
  state: ReturnType<typeof useConflict>;
  blocked: boolean;
}) {
  return (
    <details className="conflict-merge">
      <summary>수동으로 통합</summary>
      <label>
        통합할 Markdown
        <textarea
          aria-label="통합할 Markdown"
          rows={8}
          value={state.draft}
          disabled={state.busy}
          onChange={(event) => state.setDraft(event.target.value)}
        />
      </label>
      <p>
        아래 버튼을 누르면 확인한 외부 파일을 통합 내용으로 교체하고 새 버전을
        만듭니다.
      </p>
      <button
        type="button"
        disabled={blocked}
        onClick={() =>
          void state.resolve({ kind: "merge", content: state.draft })
        }
      >
        통합 내용을 새 버전으로 저장
      </button>
    </details>
  );
}

function ConflictComparisonView({
  state,
}: {
  state: ReturnType<typeof useConflict>;
}) {
  const view = state.view;
  if (!view) return null;
  return (
    <>
      {view.diskError ? (
        <>
          <p role="alert">{view.diskError.message}</p>
          <p>
            외부 파일을 읽을 수 없어 비교와 반영을 중지했습니다. 앱 내용은
            아래에 유지됩니다.
          </p>
          <pre className="conflict-app-buffer">{state.appContent}</pre>
        </>
      ) : (
        <DiffViewer
          projection={view}
          onSelection={() => {}}
          onMove={() => {}}
          jump={null}
        />
      )}
    </>
  );
}
