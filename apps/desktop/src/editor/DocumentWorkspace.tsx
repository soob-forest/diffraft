import { useEffect, useRef, useState } from "react";
import { ConflictDialog } from "../conflict/ConflictDialog";
import type { EditorState } from "../generated/EditorState";
import {
  type DocumentListControl,
  type DocumentMode,
  DocumentToolbar,
  ViewToggle,
} from "./DocumentToolbar";
import { useRequestScope } from "./request-scope";
import { useConflict } from "./useConflict";
import { useDocument } from "./useDocument";
import { useSourceRequest } from "./useSourceRequest";
import { VersionHistory } from "./VersionHistory";
import { WorkspaceBody } from "./WorkspaceBody";
import { useReviewEntry, WorkspaceControls } from "./WorkspaceControls";
import { workspaceNavigation } from "./workspace-navigation";

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
export type WorkspaceState = ReturnType<typeof useWorkspace>;
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

function useWorkspace(
  initial: EditorState,
  flushRef: FlushRef,
  documents: DocumentListControl,
) {
  const model = useDocument(initial);
  const [tasksOpen, setTasksOpen] = useState(widePanel);
  const taskFlush = useRef<(() => Promise<void>) | null>(null);
  const [mode, setMode] = useState<DocumentMode>("source");
  const entry = useReviewEntry(setMode, setTasksOpen);
  const conflict = useConflict(model);
  const [taskId, setTaskId] = useState(initial.selectedTaskId ?? "");
  const scope = useRequestScope(model.editorEpoch, initial.document.id, taskId);
  const sourceRequest = useWorkspaceSource(model, {
    taskId,
    taskFlush,
    setTaskId,
    entry,
    setMode,
    setTasksOpen,
  });
  useFlush(flushRef, taskFlush, model, sourceRequest.firstConditions);
  return {
    ...workspaceNavigation({
      model,
      taskFlush,
      setTaskId,
      entry,
      sourceRequest,
    }),
    documents,
    model,
    tasksOpen,
    setTasksOpen,
    scope,
    sourceRequest,
    taskFlush,
    mode,
    setMode,
    entry,
    conflict,
    taskId,
    setTaskId: (value: string) => {
      if (value !== taskId) entry.clearResult();
      setTaskId(value);
    },
    goal: taskName(model, taskId),
  };
}

function useFlush(
  flushRef: FlushRef,
  taskFlush: FlushRef,
  model: ReturnType<typeof useDocument>,
  firstConditions: FlushRef,
) {
  const { autosave, gate } = model;
  useEffect(() => {
    flushRef.current = async () => {
      gate.assertIdle();
      await autosave.flushForLeave();
      gate.assertIdle();
      await firstConditions.current?.();
      await taskFlush.current?.();
    };
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, taskFlush, autosave, gate, firstConditions]);
}

function widePanel() {
  return window.innerWidth > SINGLE_PANEL_WIDTH;
}

function useWorkspaceSource(
  model: ReturnType<typeof useDocument>,
  ui: {
    taskId: string;
    taskFlush: FlushRef;
    setTaskId: (id: string) => void;
    entry: ReturnType<typeof useReviewEntry>;
    setMode: (mode: DocumentMode) => void;
    setTasksOpen: (value: boolean) => void;
  },
) {
  return useSourceRequest({
    model,
    taskId: ui.taskId,
    taskFlush: ui.taskFlush,
    onResult: ui.entry.openResult,
    onTask: (task) => {
      model.taskSaved(task);
      ui.setTaskId(task.id);
    },
    show: () => {
      ui.setMode("source");
      ui.setTasksOpen(true);
    },
  });
}

function taskName(model: ReturnType<typeof useDocument>, taskId: string) {
  const task = model.state.tasks.find((task) => task.id === taskId);
  return task?.name ?? task?.goal ?? "새 작업";
}
