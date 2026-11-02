import type { ConversationResult } from "../generated/ConversationResult";
import { errorMessage } from "../ipc";
import { currentResult } from "../review/result-destination";
import { editorCommand } from "./api";
import type { FlushRef } from "./DocumentWorkspace";
import type { useDocument } from "./useDocument";
import type { SourceRequest } from "./useSourceRequest";
import type { useReviewEntry } from "./WorkspaceControls";
export function workspaceNavigation(state: {
  model: ReturnType<typeof useDocument>;
  taskFlush: FlushRef;
  setTaskId: (value: string) => void;
  entry: ReturnType<typeof useReviewEntry>;
  sourceRequest: SourceRequest;
}) {
  const { model, taskFlush, setTaskId, entry, sourceRequest } = state;
  return {
    openSourceOverlap: (value: string, result: ConversationResult) =>
      sourceRequest.run(async () => {
        await sourceRequest.selection.draft.flush();
        if (
          await openReviewTask({ model, taskFlush, setTaskId, entry }, value)
        ) {
          sourceRequest.close();
          entry.openResult(currentResult(result));
        }
      }),
    openReviewTask: (value: string) =>
      openReviewTask({ model, taskFlush, setTaskId, entry }, value),
  };
}
async function openReviewTask(
  {
    model,
    taskFlush,
    setTaskId,
    entry,
  }: {
    model: ReturnType<typeof useDocument>;
    taskFlush: FlushRef;
    setTaskId: (value: string) => void;
    entry: ReturnType<typeof useReviewEntry>;
  },
  value: string,
) {
  try {
    await model.autosave.flush();
    await taskFlush.current?.();
    await editorCommand(
      {
        kind: "select_task",
        documentId: model.state.document.id,
        taskId: value,
      },
      "selected_task",
    );
    setTaskId(value);
    entry.clearResult();
    entry.show();
    return true;
  } catch (reason) {
    model.setError(errorMessage(reason));
    return false;
  }
}
