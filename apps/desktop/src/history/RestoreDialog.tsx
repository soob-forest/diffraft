import { useEffect, useRef } from "react";
import { ComparisonViewer } from "../review/ComparisonViewer";
import type { useHistory } from "./useHistory";
import "./history.css";
import { versionReasons } from "./version-reasons";

type Props = { history: ReturnType<typeof useHistory> };
export function RestoreDialog({
  history,
  returnFocus,
}: Props & { returnFocus: React.RefObject<HTMLButtonElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      returnFocus.current?.focus();
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={dialog}
      className="approval-dialog restore-dialog"
      aria-labelledby="restore-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!history.busy) history.close();
      }}
    >
      <div className="restore-layout">
        <RestoreVersions history={history} />
        <section className="restore-reading">
          <RestoreContent history={history} />
        </section>
      </div>
    </dialog>
  );
}

function RestoreContent({ history }: Props) {
  const view = history.selected?.comparison;
  if (!view) return null;
  return (
    <>
      <h2 id="restore-title">
        현재 v{view.currentVersion} → 복원할 v{view.target.number} 내용
      </h2>
      <p>
        − 현재 내용 · + 복원할 내용. 새 v{view.currentVersion + 1}을 만들고 모든
        이전 버전·대화·코멘트를 보존합니다. 미승인 제안은 다시 검토해야 합니다.
      </p>
      {history.message && <p role="alert">{history.message}</p>}
      <ComparisonViewer comparison={view} />
      <div className="dialog-actions">
        <button type="button" disabled={history.busy} onClick={history.close}>
          복원 취소
        </button>
        <button
          type="button"
          className="primary"
          disabled={history.busy}
          onClick={() => void history.restore()}
        >
          v{view.target.number} 내용으로 복원
        </button>
      </div>
    </>
  );
}

function RestoreVersions({ history }: Props) {
  return (
    <nav className="restore-versions" aria-label="복원할 버전">
      <h3>버전 기록</h3>
      {history.versions.map((version) => (
        <button
          type="button"
          key={version.id}
          aria-pressed={version.id === history.selected?.comparison.target.id}
          disabled={
            history.busy ||
            version.number === history.selected?.comparison.currentVersion
          }
          onClick={() => void history.compare(version.id)}
        >
          v{version.number} · {versionReasons[version.reason] ?? version.reason}
        </button>
      ))}
    </nav>
  );
}
