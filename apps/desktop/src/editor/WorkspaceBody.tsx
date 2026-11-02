import { DocumentMain } from "./DocumentMain";
import type { WorkspaceState } from "./DocumentWorkspace";
import { SourceRequestPanel } from "./SourceRequestPanel";
import { WorkspacePanels } from "./WorkspacePanels";
import { DocumentTasks } from "./WorkspaceTasks";
export function WorkspaceBody({ state }: { state: WorkspaceState }) {
  const {
    model,
    mode,
    setMode,
    tasksOpen,
    setTasksOpen,
    taskFlush,
    taskId,
    entry,
  } = state;
  return (
    <WorkspacePanels
      mode={mode}
      source={
        state.sourceRequest.visible ? <WorkspaceSource state={state} /> : null
      }
      open={{ value: tasksOpen, set: setTasksOpen }}
      tasks={<WorkspaceTasks state={state} />}
    >
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
