import { useState } from "react";
import type { ConversationResult } from "../generated/ConversationResult";
import { ReviewPanel } from "../review/ReviewPanel";
import { type DocumentMode, SaveError } from "./DocumentToolbar";
import { EditingArea } from "./EditingArea";
import { ReviewResume } from "./ReviewResume";
import type { RequestScope } from "./request-scope";
import { SelectionPopover } from "./SelectionPopover";
import { SourceImpact } from "./SourceImpact";
import type { DocumentModel } from "./useDocument";
import type { SourceRequest } from "./useSourceRequest";

type DocumentMainProps = {
  model: DocumentModel;
  mode: DocumentMode;
  setMode: (value: DocumentMode) => void;
  taskId: string;
  flushTask: () => Promise<void>;
  scope: RequestScope;
  sourceRequest: SourceRequest;
  rewriteRequest: number;
  requestedResult: ConversationResult | null;
  onResult: (result: ConversationResult) => void;
  selectedDraftRequest: number;
  onRequestOpen: () => void;
  onReviewTask: (taskId: string) => void;
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
      <SourceRequests {...props} />
      {mode !== "review" && taskId && (
        <ReviewResume
          key={`resume:${taskId}`}
          model={model}
          taskId={taskId}
          resume={() => setMode("review")}
        />
      )}
      <WorkspaceEditor
        model={model}
        mode={mode}
        scope={scope}
        sourceRequest={props.sourceRequest}
      />
      <ReviewPanel
        active={mode === "review"}
        key={`review:${taskId}`}
        document={model}
        taskId={taskId}
        flushTask={flushTask}
        rewriteRequest={rewriteRequest}
        appliedTarget={appliedTarget}
        onPreview={() => setMode("preview")}
        onRequest={() => {
          setMode("source");
          props.onRequestOpen();
        }}
        requestedResult={props.requestedResult}
        onResult={props.onResult}
        selectedDraftRequest={props.selectedDraftRequest}
      />
      <div className="applied-version-host" ref={setAppliedTarget} />
    </div>
  );
}

function WorkspaceEditor({
  model,
  mode,
  scope,
  sourceRequest,
}: Pick<DocumentMainProps, "model" | "mode" | "scope" | "sourceRequest">) {
  return (
    <div className="editor-region" hidden={mode === "review"}>
      <EditingArea
        model={model}
        preview={mode === "preview"}
        navigationVisible={mode !== "review"}
        onSelection={scope.setSelection}
        action={{
          active: mode === "source",
          onPosition: sourceRequest.setPopup,
          edit: (value) => void sourceRequest.open(value),
          pinned: sourceRequest.pinned,
          returnSerial: sourceRequest.returnSerial,
          dismiss:
            sourceRequest.visible &&
            !sourceRequest.busy &&
            !sourceRequest.form.busy
              ? () => {
                  void sourceRequest.dismiss();
                }
              : undefined,
        }}
      />
    </div>
  );
}

function SourceRequests(props: DocumentMainProps) {
  const { model, mode, taskId } = props;
  return (
    <>
      {mode === "source" && (
        <SourcePopover request={props.sourceRequest} taskId={taskId} />
      )}
      {mode === "source" && (
        <SourceImpact
          documentId={model.state.document.id}
          onReview={props.onReviewTask}
        />
      )}
    </>
  );
}
function SourcePopover({
  request,
  taskId,
}: {
  request: SourceRequest;
  taskId: string;
}) {
  const target = request.selection.draft.value.target;
  return (
    <>
      {taskId && !request.visible && target?.kind === "confirmed" && (
        <button
          type="button"
          className="source-draft-resume"
          onClick={request.resume}
        >
          선택 수정 초안 이어쓰기
        </button>
      )}
      {request.popup && (
        <SelectionPopover
          position={request.popup.position}
          close={(restoreFocus) => {
            request.setPopup(null);
            if (restoreFocus)
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>('[data-testid="source-editor"]')
                  ?.focus(),
              );
          }}
        >
          <button
            type="button"
            className="primary selection-primary"
            disabled={request.busy}
            onClick={() => {
              if (request.popup) void request.open(request.popup.captured);
            }}
          >
            이 부분 수정
          </button>
        </SelectionPopover>
      )}
      {!request.visible && request.message && (
        <p role="status">{request.message}</p>
      )}
    </>
  );
}
