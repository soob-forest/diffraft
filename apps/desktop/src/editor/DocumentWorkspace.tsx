import { useEffect, useRef, useState } from "react";
import { ConflictDialog } from "../conflict/ConflictDialog";
import type { EditorState } from "../generated/EditorState";
import { GenerationPanel } from "../generation/GenerationPanel";
import { errorMessage } from "../ipc";
import { DocumentMain } from "./DocumentMain";
import type { DocumentMode } from "./DocumentToolbar";
import { type RequestScope, useRequestScope } from "./request-scope";
import { TaskPanel } from "./TaskPanel";
import { useDocument } from "./useDocument";

export type FlushRef = React.RefObject<(() => Promise<void>) | null>;
type Props = { initial: EditorState; flushRef: FlushRef };
export function DocumentWorkspace({ initial, flushRef }: Props) {
  const model = useDocument(initial);
  const scope = useRequestScope(model.editorEpoch);
  const taskFlush = useRef<(() => Promise<void>) | null>(null);
  const [mode, setMode] = useState<DocumentMode>("source");
  const [conflict, setConflict] = useState(false);
  const [taskId, setTaskId] = useState(initial.selectedTaskId ?? "");
  useFlush(flushRef, taskFlush, model);
  const compare = async () => {
    model.gate.assertIdle();
    try {
      await model.autosave.flush();
    } catch (error) {
      model.setError(errorMessage(error));
    }
    setConflict(true);
  };
  return (
    <main className="document-workspace">
      <DocumentMain
        model={model}
        mode={mode}
        setMode={setMode}
        taskId={taskId}
        scope={scope}
        onConflict={() => void compare()}
        flushTask={async () => {
          await taskFlush.current?.();
        }}
      />
      <DocumentTasks
        model={model}
        taskFlush={taskFlush}
        taskId={taskId}
        onSelect={setTaskId}
        scope={scope}
        onProposal={() => setMode("review")}
      />
      {conflict && (
        <ConflictDialog model={model} onClose={() => setConflict(false)} />
      )}
    </main>
  );
}

function DocumentTasks({
  model,
  taskFlush,
  taskId,
  onSelect,
  scope,
  onProposal,
}: {
  model: ReturnType<typeof useDocument>;
  taskFlush: FlushRef;
  taskId: string;
  onSelect: (value: string) => void;
  scope: RequestScope;
  onProposal: () => void;
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
      {taskId && (
        <GenerationPanel
          key={taskId}
          model={model}
          taskId={taskId}
          taskFlush={taskFlush}
          scope={scope}
          onProposal={onProposal}
        />
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
