import { useDraftPersistence } from "../drafts/SessionDrafts";
import { chooseRequestTarget, requestKey } from "../generation/request-targets";
import { errorMessage } from "../ipc";
import { DocumentMain } from "./DocumentMain";
import type { WorkspaceState } from "./DocumentWorkspace";
import { SourceRequestPanel } from "./SourceRequestPanel";
import { WorkspacePanels } from "./WorkspacePanels";
import { DocumentTasks } from "./WorkspaceTasks";
export function WorkspaceBody({ state }: { state: WorkspaceState }) {
  const { store } = useDraftPersistence();
  const { mode, tasksOpen, setTasksOpen } = state;
  return (
    <WorkspacePanels
      mode={mode}
      width={{ value: state.panelWidth, set: state.setPanelWidth }}
      showSource={() => openConfirmedRequest(state, store)}
      source={
        state.sourceRequest.visible ? <WorkspaceSource state={state} /> : null
      }
      open={{ value: tasksOpen, set: setTasksOpen }}
      tasks={<WorkspaceTasks state={state} />}
    >
      <WorkspaceMain state={state} />
    </WorkspacePanels>
  );
}

function WorkspaceSource({ state }: { state: WorkspaceState }) {
  const { taskId, model } = state;
  if (!state.sourceRequest.visible) return null;
  return (
    <SourceRequestPanel
      key={taskId}
      request={state.sourceRequest}
      model={model}
      scope={state.scope}
      taskId={taskId}
      onOverlap={state.openSourceOverlap}
    />
  );
}
function WorkspaceTasks({ state }: { state: WorkspaceState }) {
  const { model, taskFlush, taskId, setTaskId, scope, entry } = state;
  return (
    <DocumentTasks
      model={model}
      taskFlush={taskFlush}
      taskId={taskId}
      onSelect={setTaskId}
      scope={scope}
      onProposal={entry.show}
      onRewrite={entry.rewrite}
      onResult={entry.openResult}
      onSelectedDraft={(surface) => {
        if (surface === "source") state.sourceRequest.resume();
        else entry.openSelectedDraft();
      }}
    />
  );
}

function WorkspaceMain({ state }: { state: WorkspaceState }) {
  const { model, mode, setMode, taskId, entry, setTasksOpen, taskFlush } =
    state;
  return (
    <DocumentMain
      model={model}
      mode={mode}
      setMode={setMode}
      taskId={taskId}
      rewriteRequest={entry.rewriteRequest}
      requestedResult={entry.result}
      onResult={entry.openResult}
      selectedDraftRequest={entry.selectedDraftRequest}
      onRequestOpen={() => setTasksOpen(true)}
      onReviewTask={state.openReviewTask}
      scope={state.scope}
      sourceRequest={state.sourceRequest}
      flushTask={async () => {
        await taskFlush.current?.();
      }}
    />
  );
}

function openConfirmedRequest(
  state: WorkspaceState,
  store: ReturnType<typeof useDraftPersistence>["store"],
) {
  const { model, taskId, setMode, setTasksOpen } = state;
  try {
    chooseRequestTarget(
      store,
      requestKey(model.state.document.id, taskId),
      { question: undefined, referenceBatchId: undefined },
      "PATCH",
    );
    state.scope.setKind("selection");
    state.scope.setSelection({ from: 0, to: 0, cursor: 0 });
    state.sourceRequest.close();
    setMode("source");
    setTasksOpen(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".source-editor .cm-content")
        ?.focus(),
    );
  } catch (reason) {
    model.setError(errorMessage(reason));
  }
}
