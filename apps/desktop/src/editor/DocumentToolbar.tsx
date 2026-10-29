import { ExportControls } from "../export/ExportControls";
import { errorMessage } from "../ipc";
import { DocumentMenu } from "./DocumentMenu";
import type { DocumentModel } from "./useDocument";

type Props = {
  model: DocumentModel;
  mode: DocumentMode;
  setMode: (value: DocumentMode) => void;
  onConflict: () => void;
  documents: DocumentListControl;
};
export type DocumentListControl = { open: boolean; toggle: () => void };
export type DocumentMode = "source" | "review" | "preview";
export function DocumentToolbar({
  model,
  onConflict,
  documents,
}: Pick<Props, "model" | "onConflict" | "documents">) {
  return (
    <header className="document-toolbar" inert={model.mutating}>
      <h1 title={model.state.document.path}>{model.state.document.title}</h1>
      <span className="version-badge">v{model.status.version}</span>
      <span
        role="status"
        data-testid="save-status"
        className={model.status.error ? "danger" : "save-status"}
      >
        원문 {model.status.label}
      </span>
      <div className="document-header-actions">
        <button
          type="button"
          className="document-list-toggle"
          aria-expanded={documents.open}
          aria-controls="document-list"
          onClick={documents.toggle}
        >
          문서 목록
        </button>
        <button
          type="button"
          className="file-compare-action"
          disabled={model.status.saving}
          onClick={onConflict}
        >
          파일 비교·복구
        </button>
        <DocumentMenu model={model} onConflict={onConflict} />
        <ExportControls model={model} />
      </div>
    </header>
  );
}

export function SaveError({ model }: { model: DocumentModel }) {
  if (!model.error && !model.status.error) return null;
  const retry = () => {
    void model.autosave
      .retry()
      .catch((error: unknown) => model.setError(errorMessage(error)));
  };
  return (
    <div className="error-banner" role="alert">
      {model.status.error || model.error}
      {model.status.error && (
        <button type="button" onClick={retry}>
          저장 다시 시도
        </button>
      )}
    </div>
  );
}

export function ViewToggle({ mode, setMode }: Pick<Props, "mode" | "setMode">) {
  return (
    <div className="view-toggle">
      <button
        type="button"
        aria-pressed={mode === "source"}
        onClick={() => setMode("source")}
      >
        원문
      </button>
      <button
        type="button"
        aria-pressed={mode === "review"}
        onClick={() => setMode("review")}
      >
        변경 검토
      </button>
      <button
        type="button"
        aria-pressed={mode === "preview"}
        onClick={() => setMode("preview")}
      >
        미리보기
      </button>
    </div>
  );
}
