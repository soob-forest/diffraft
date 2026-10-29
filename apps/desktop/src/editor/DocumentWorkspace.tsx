import { useEffect, useRef, useState } from "react";
import { ConflictDialog } from "../conflict/ConflictDialog";
import type { EditorState } from "../generated/EditorState";
import { GenerationPanel } from "../generation/GenerationPanel";
import { errorMessage } from "../ipc";
import { DocumentMain } from "./DocumentMain";
import {
  type DocumentListControl,
  type DocumentMode,
  DocumentToolbar,
  ViewToggle,
} from "./DocumentToolbar";
import { type RequestScope, useRequestScope } from "./request-scope";
import { TaskPanel } from "./TaskPanel";
import { useDocument } from "./useDocument";
import { VersionHistory } from "./VersionHistory";
import { WorkspacePanels } from "./WorkspacePanels";

export type FlushRef = React.RefObject<(() => Promise<void>) | null>;
type Props = {
  initial: EditorState;
  flushRef: FlushRef;
  documents: DocumentListControl;
};
const SINGLE_PANEL_WIDTH = 720;
export function DocumentWorkspace({ initial, flushRef, documents }: Props) {
  return <WorkspaceLayout state={useWorkspace(initial, flushRef, documents)} />;
}
type WorkspaceState = ReturnType<typeof useWorkspace>;
function WorkspaceLayout({ state }: { state: WorkspaceState }) {
  const { model, tasksOpen, setTasksOpen, mode, setMode, conflict, goal } =
    state;
  return (
    <main
      className="document-workspace"
      data-tasks-open={tasksOpen}
      data-mode={mode}
    >
      <DocumentToolbar
        model={model}
        documents={state.documents}
        onConflict={() => void conflict.compare()}
      />
      <div className="document-modebar">
        <ViewToggle mode={mode} setMode={setMode} />
        <WorkspaceControls
          goal={goal}
          tasksOpen={tasksOpen}
          setTasksOpen={setTasksOpen}
        />
      </div>
      <WorkspaceBody state={state} />
      <div className="document-history">
        <VersionHistory model={model} />
      </div>
      {conflict.open && (
        <ConflictDialog model={model} onClose={conflict.close} />
      )}
    </main>
  );
}

function WorkspaceBody({ state }: { state: WorkspaceState }) {
  const {
    model,
    mode,
    setMode,
    tasksOpen,
    setTasksOpen,
    taskFlush,
    taskId,
    setTaskId,
    scope,
    entry,
  } = state;
  return (
    <WorkspacePanels
      mode={mode}
      open={{ value: tasksOpen, set: setTasksOpen }}
      tasks={
        <DocumentTasks
          model={model}
          taskFlush={taskFlush}
          taskId={taskId}
          onSelect={setTaskId}
          scope={scope}
          onProposal={entry.show}
          onRewrite={entry.rewrite}
        />
      }
    >
      <DocumentMain
        model={model}
        mode={mode}
        setMode={setMode}
        taskId={taskId}
        rewriteRequest={entry.rewriteRequest}
        scope={scope}
        flushTask={async () => {
          await taskFlush.current?.();
        }}
      />
    </WorkspacePanels>
  );
}

function useWorkspace(
  initial: EditorState,
  flushRef: FlushRef,
  documents: DocumentListControl,
) {
  const model = useDocument(initial);
  const [tasksOpen, setTasksOpen] = useState(
    () => window.innerWidth > SINGLE_PANEL_WIDTH,
  );
  const scope = useRequestScope(model.editorEpoch);
  const taskFlush = useRef<(() => Promise<void>) | null>(null);
  const [mode, setMode] = useState<DocumentMode>("source");
  const entry = useReviewEntry(setMode, setTasksOpen);
  const conflict = useConflict(model);
  const [taskId, setTaskId] = useState(initial.selectedTaskId ?? "");
  useFlush(flushRef, taskFlush, model);
  return {
    documents,
    model,
    tasksOpen,
    setTasksOpen,
    scope,
    taskFlush,
    mode,
    setMode,
    entry,
    conflict,
    taskId,
    setTaskId,
    goal:
      model.state.tasks.find((task) => task.id === taskId)?.goal || "새 작업",
  };
}

function useReviewEntry(
  setMode: (mode: DocumentMode) => void,
  setTasksOpen: (open: boolean) => void,
) {
  const [rewriteRequest, setRewriteRequest] = useState(0);
  const show = () => {
    setMode("review");
    if (window.innerWidth <= SINGLE_PANEL_WIDTH) setTasksOpen(false);
  };
  return {
    rewriteRequest,
    show,
    rewrite: () => {
      setRewriteRequest((value) => value + 1);
      show();
    },
  };
}

function DocumentTasks({
  model,
  taskFlush,
  taskId,
  onSelect,
  scope,
  onProposal,
  onRewrite,
}: {
  model: ReturnType<typeof useDocument>;
  taskFlush: FlushRef;
  taskId: string;
  onSelect: (value: string) => void;
  scope: RequestScope;
  onProposal: () => void;
  onRewrite: () => void;
}) {
  return (
    <TaskPanel
      gate={model.gate}
      disabled={model.mutating}
      flushRef={taskFlush}
      selected={taskId}
      onSelect={onSelect}
      documentId={model.state.document.id}
      tasks={model.state.tasks}
      flush={() => model.autosave.flush()}
      onSaved={model.taskSaved}
    >
      {(conditions) => (
        <GenerationPanel
          key={taskId}
          model={model}
          taskId={taskId}
          taskFlush={taskFlush}
          scope={scope}
          onProposal={onProposal}
          onRewrite={onRewrite}
        >
          {conditions}
        </GenerationPanel>
      )}
    </TaskPanel>
  );
}

function useFlush(
  flushRef: FlushRef,
  taskFlush: FlushRef,
  model: ReturnType<typeof useDocument>,
) {
  const { autosave, gate } = model;
  useEffect(() => {
    flushRef.current = async () => {
      gate.assertIdle();
      await autosave.flushForLeave();
      gate.assertIdle();
      await taskFlush.current?.();
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, taskFlush, autosave, gate]);
}

function WorkspaceControls({
  goal,
  tasksOpen,
  setTasksOpen,
}: {
  goal: string;
  tasksOpen: boolean;
  setTasksOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="workspace-controls">
      <span title={goal}>현재 작업 · {goal}</span>
      <button
        type="button"
        aria-expanded={tasksOpen}
        aria-controls="task-panel"
        onClick={() => setTasksOpen((value) => !value)}
      >
        {tasksOpen ? "작업 패널 접기" : "작업·AI 요청 열기"}
      </button>
    </div>
  );
}

function useConflict(model: ReturnType<typeof useDocument>) {
  const [conflict, setConflict] = useState(false);
  const compare = async () => {
    model.gate.assertIdle();
    try {
      await model.autosave.flush();
    } catch (error) {
      model.setError(errorMessage(error));
    }
    setConflict(true);
  };
  return { open: conflict, close: () => setConflict(false), compare };
}
