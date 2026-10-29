import { errorMessage } from "../ipc";
import type { DocumentModel } from "./useDocument";

export function DocumentMenu({
  model,
  onConflict,
}: {
  model: DocumentModel;
  onConflict: () => void;
}) {
  const save = () => {
    void model.autosave
      .flush()
      .catch((error: unknown) => model.setError(errorMessage(error)));
  };
  return (
    <details className="document-menu">
      <summary aria-label="문서 메뉴">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="3" cy="8" r="1" fill="currentColor" />
          <circle cx="8" cy="8" r="1" fill="currentColor" />
          <circle cx="13" cy="8" r="1" fill="currentColor" />
        </svg>
      </summary>
      <div>
        <button type="button" disabled={model.status.saving} onClick={save}>
          저장
        </button>
        <button
          type="button"
          className="menu-compare-action"
          disabled={model.status.saving}
          onClick={onConflict}
        >
          파일 비교·복구
        </button>
        <details className="document-location">
          <summary>파일 위치</summary>
          <span className="document-path">
            {model.state.document.path || "아직 저장하지 않은 문서"}
          </span>
        </details>
      </div>
    </details>
  );
}
