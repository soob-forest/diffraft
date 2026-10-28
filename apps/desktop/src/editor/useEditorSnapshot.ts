import { useEffect, useRef, useState } from "react";
import type { EditorState } from "../generated/EditorState";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import { mergeEditorRead } from "./editor-state";

export function useEditorSnapshot(
  initial: EditorState,
  version: number,
  setError: (message: string) => void,
) {
  const [state, setState] = useState(initial);
  const taskWrites = useRef(0);
  useEffect(() => {
    let active = true;
    const startedAt = taskWrites.current;
    editorCommand(
      { kind: "read", documentId: initial.document.id },
      "state",
    ).then(
      (value) => {
        if (active && value.document.version >= version)
          setState((previous) =>
            mergeEditorRead(previous, value, startedAt !== taskWrites.current),
          );
      },
      (reason: unknown) => {
        if (active) setError(errorMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [initial.document.id, version, setError]);
  const taskSaved = (task: TaskSnapshot) => {
    taskWrites.current++;
    setState((previous) => ({
      ...previous,
      tasks: [...previous.tasks.filter((value) => value.id !== task.id), task],
    }));
  };
  return { state, setState, taskSaved };
}
