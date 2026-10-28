import { ReviewPanel } from "../review/ReviewPanel";
import {
  type DocumentMode,
  DocumentToolbar,
  SaveError,
} from "./DocumentToolbar";
import { EditingArea } from "./EditingArea";
import type { RequestScope } from "./request-scope";
import { ScopeBar } from "./ScopeBar";
import type { DocumentModel } from "./useDocument";
import { VersionHistory } from "./VersionHistory";

type DocumentMainProps = {
  model: DocumentModel;
  mode: DocumentMode;
  setMode: (value: DocumentMode) => void;
  taskId: string;
  onConflict: () => void;
  flushTask: () => Promise<void>;
  scope: RequestScope;
};
export function DocumentMain({
  model,
  mode,
  setMode,
  taskId,
  onConflict,
  flushTask,
  scope,
}: DocumentMainProps) {
  return (
    <div
      className="document-main"
      inert={model.mutating}
      aria-busy={model.mutating}
    >
      <DocumentToolbar
        model={model}
        mode={mode}
        setMode={setMode}
        onConflict={onConflict}
      />
      <div className="document-path" title={model.state.document.path}>
        {model.state.document.path}
      </div>
      <SaveError model={model} />
      <div className="editor-region" hidden={mode === "review"}>
        <EditingArea
          model={model}
          preview={mode === "preview"}
          onSelection={scope.setSelection}
        />
        <ScopeBar model={model} requestScope={scope} />
      </div>
      {mode === "review" && (
        <ReviewPanel
          key={taskId}
          document={model}
          taskId={taskId}
          flushTask={flushTask}
        />
      )}
      <VersionHistory model={model} />
    </div>
  );
}
