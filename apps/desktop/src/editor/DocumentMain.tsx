import { useState } from "react";
import { ReviewPanel } from "../review/ReviewPanel";
import { type DocumentMode, SaveError } from "./DocumentToolbar";
import { EditingArea } from "./EditingArea";
import { ReviewResume } from "./ReviewResume";
import type { RequestScope } from "./request-scope";
import type { DocumentModel } from "./useDocument";

type DocumentMainProps = {
  model: DocumentModel;
  mode: DocumentMode;
  setMode: (value: DocumentMode) => void;
  taskId: string;
  flushTask: () => Promise<void>;
  scope: RequestScope;
  rewriteRequest: number;
};
export function DocumentMain(props: DocumentMainProps) {
  const { model, mode, setMode, taskId, flushTask, scope, rewriteRequest } =
    props;
  const [appliedTarget, setAppliedTarget] = useState<HTMLDivElement | null>(
    null,
  );
  return (
    <div
      className="document-main"
      inert={model.mutating}
      aria-busy={model.mutating}
    >
      <SaveError model={model} />
      {mode !== "review" && taskId && (
        <ReviewResume
          key={`resume:${taskId}`}
          model={model}
          taskId={taskId}
          resume={() => setMode("review")}
        />
      )}
      <WorkspaceEditor model={model} mode={mode} scope={scope} />
      <ReviewPanel
        active={mode === "review"}
        key={`review:${taskId}`}
        document={model}
        taskId={taskId}
        flushTask={flushTask}
        rewriteRequest={rewriteRequest}
        appliedTarget={appliedTarget}
      />
      <div className="applied-version-host" ref={setAppliedTarget} />
    </div>
  );
}

function WorkspaceEditor({
  model,
  mode,
  scope,
}: Pick<DocumentMainProps, "model" | "mode" | "scope">) {
  return (
    <div className="editor-region" hidden={mode === "review"}>
      <EditingArea
        model={model}
        preview={mode === "preview"}
        navigationVisible={mode !== "review"}
        onSelection={scope.setSelection}
      />
    </div>
  );
}
