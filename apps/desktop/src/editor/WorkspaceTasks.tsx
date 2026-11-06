import type { ConversationResult } from "../generated/ConversationResult";
import { GenerationPanel } from "../generation/GenerationPanel";
import type { SelectionSurface } from "../review/selected-draft-index";
import type { FlushRef } from "./DocumentWorkspace";
import type { RequestScope } from "./request-scope";
import { TaskPanel } from "./TaskPanel";
import type { useDocument } from "./useDocument";

type Props = {
  model: ReturnType<typeof useDocument>;
  taskFlush: FlushRef;
  taskId: string;
  onSelect: (value: string) => void;
  scope: RequestScope;
  onProposal: () => void;
  onRewrite: () => void;
  onResult: (result: ConversationResult) => void;
  onSelectedDraft: (surface: SelectionSurface) => void;
};
export function DocumentTasks({
  model,
  taskFlush,
  taskId,
  onSelect,
  scope,
  onProposal,
  onRewrite,
  onResult,
  onSelectedDraft,
}: Props) {
  return (
    <TaskPanel
      model={model}
      scope={scope}
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
          onResult={onResult}
          onSelectedDraft={onSelectedDraft}
        >
          {conditions}
        </GenerationPanel>
      )}
    </TaskPanel>
  );
}
