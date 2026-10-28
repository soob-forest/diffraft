import type { EditorState } from "../generated/EditorState";

export function mergeEditorRead(
  previous: EditorState,
  incoming: EditorState,
  tasksChanged: boolean,
): EditorState {
  if (
    incoming.document.id !== previous.document.id ||
    incoming.document.version < previous.document.version ||
    (incoming.document.version === previous.document.version &&
      incoming.document.path !== previous.document.path)
  )
    return previous;
  if (tasksChanged) return { ...incoming, tasks: previous.tasks };
  return incoming;
}
