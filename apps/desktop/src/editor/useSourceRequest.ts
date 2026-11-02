import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDraftPersistence } from "../drafts/SessionDrafts";
import type { ConversationResult } from "../generated/ConversationResult";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import { currentResult } from "../review/result-destination";
import { useSelectedRequest } from "../review/useSelectedRequest";
import type { FlushRef } from "./DocumentWorkspace";
import type { PopoverPosition } from "./SelectionPopover";
import { sourceOperations } from "./source-request-operations";
import type { CapturedSourceSelection } from "./source-selection";
import type { DocumentModel } from "./useDocument";
import { useSourceGeneration } from "./useSourceGeneration";

export type SourceRequestProps = {
  model: DocumentModel;
  taskId: string;
  taskFlush: FlushRef;
  onResult: (result: ConversationResult) => void;
  onTask: (task: TaskSnapshot) => void;
  show: () => void;
};
export type SourceSelectionAction = {
  position: PopoverPosition;
  captured: CapturedSourceSelection;
};
export function useSourceRequest(props: SourceRequestProps) {
  const drafts = useDraftPersistence(),
    state = useSourceRequestState(props.taskId);
  const selection = useSelectedRequest(
    props.model.state.document.id,
    props.taskId,
    "source",
  );
  const operations = sourceOperations(
    {
      props,
      drafts,
      selection,
      taskIdentity: state.taskIdentity,
      captured: state.captured,
    },
    state,
  );
  const pinned = usePinnedSource(selection.draft.value.target, state);
  const close = () => {
    state.setVisible(false);
    selection.setActive(false);
    state.setReturnSerial((value) => value + 1);
  };
  const form = useSourceGeneration({
    documentId: props.model.state.document.id,
    taskId: props.taskId,
    selection,
    prepare: operations.prepare,
    onBusy: state.setBusy,
    onSaved: (result) => {
      close();
      props.onResult(currentResult(result, true));
    },
  });
  return {
    ...state,
    selection,
    pinned,
    form,
    open: (value: CapturedSourceSelection) =>
      state.run(() => operations.open(value)),
    createTask: (goal: string, instruction: string) =>
      state.run(() => operations.createTask(goal, instruction)),
    prepare: operations.prepare,
    resume: operations.resume,
    close,
  };
}
function useSourceRequestState(taskId: string) {
  const [popup, setPopup] = useState<SourceSelectionAction | null>(null);
  const [captured, setCaptured] = useState<CapturedSourceSelection | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState(""),
    [returnSerial, setReturnSerial] = useState(0);
  const [firstDraft, setFirstDraft] = useState({ goal: "", instruction: "" });
  const taskIdentity = useRef(crypto.randomUUID()),
    previousTask = useRef(taskId);
  const operation = useSourceOperation(setMessage);
  useLayoutEffect(() => {
    const firstTask = !previousTask.current && taskId === taskIdentity.current;
    if (previousTask.current !== taskId && !firstTask) {
      setVisible(false);
      setPopup(null);
      setCaptured(null);
      setMessage("");
    }
    if (previousTask.current && !taskId) {
      taskIdentity.current = crypto.randomUUID();
      setFirstDraft({ goal: "", instruction: "" });
    }
    previousTask.current = taskId;
  }, [taskId]);
  return {
    popup,
    setPopup,
    captured,
    setCaptured,
    visible,
    setVisible,
    ...operation,
    message,
    setMessage,
    returnSerial,
    setReturnSerial,
    taskIdentity,
    firstDraft,
    setFirstDraft,
  };
}
function usePinnedSource(
  target: ReturnType<typeof useSelectedRequest>["draft"]["value"]["target"],
  state: ReturnType<typeof useSourceRequestState>,
) {
  return useMemo(
    () =>
      state.visible && target?.kind === "confirmed"
        ? {
            source: target.candidate,
            quote: target.selection.quote,
            selection: {
              from: target.selection.fromUtf16,
              to: target.selection.toUtf16,
              cursor: target.selection.toUtf16,
            },
          }
        : state.captured,
    [state.visible, target, state.captured],
  );
}
function useSourceOperation(setMessage: (value: string) => void) {
  const [busy, setBusy] = useState(false),
    running = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (running.current || busy) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, setBusy, run };
}
export type SourceRequest = ReturnType<typeof useSourceRequest>;
