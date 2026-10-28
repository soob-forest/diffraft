import { ExportControls } from "../export/ExportControls";
import { errorMessage } from "../ipc";
import type { DocumentModel } from "./useDocument";

type Props = {
  model: DocumentModel;
  mode: DocumentMode;
  setMode: (value: DocumentMode) => void;
  onConflict: () => void;
};
export type DocumentMode = "source" | "review" | "preview";
export function DocumentToolbar({ model, mode, setMode, onConflict }: Props) {
  const save = () => {
    void model.autosave
      .flush()
      .catch((error: unknown) => model.setError(errorMessage(error)));
  };
  return (
    <header className="document-toolbar">
      <h1>{model.state.document.title}</h1>
      <span className="version-badge">v{model.status.version}</span>
      <span
        role="status"
        data-testid="save-status"
        className={model.status.error ? "danger" : "save-status"}
      >
        {model.status.label}
      </span>
      <ViewToggle mode={mode} setMode={setMode} />
      <button type="button" disabled={model.status.saving} onClick={save}>
        저장
      </button>
      <button type="button" disabled={model.status.saving} onClick={onConflict}>
        파일 비교·복구
      </button>
      <ExportControls model={model} />
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

function ViewToggle({ mode, setMode }: Pick<Props, "mode" | "setMode">) {
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
