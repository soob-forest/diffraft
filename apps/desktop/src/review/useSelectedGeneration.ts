import { useEffect, useRef, useState } from "react";
import type { ConversationResult } from "../generated/ConversationResult";
import { useRequestInvalidation } from "../generation/request-invalidation";
import { errorMessage } from "../ipc";
import {
  confirmSelected,
  prepareSelected,
  saveDirectSelection,
} from "./selected-request-operations";
import type { useSelectedRequest } from "./useSelectedRequest";

export type SelectedGenerationProps = {
  selection: ReturnType<typeof useSelectedRequest>;
  prepare: () => Promise<void>;
  onBusy: (value: boolean) => void;
  onSaved: (result: ConversationResult) => void;
};
export function useSelectedGeneration(props: SelectedGenerationProps) {
  const operation = useSelectedOperation(props);
  const { run, mounted, setMessage } = operation;
  const revision = useRef(0);
  const prepare = () =>
    run(async () => {
      const started = revision.current;
      await prepareSelected(props, mounted, () => started === revision.current);
    }, "prepare");
  useInitialSelectedPreparation(props.selection.draft, prepare);
  useRequestInvalidation(() => {
    const draft = props.selection.draft;
    if (operation.phase.current === "commit") return;
    revision.current += 1;
    if (draft.value.prepared || operation.phase.current === "prepare") {
      if (draft.value.prepared)
        draft.replace(draft.value, { ...draft.value, prepared: null });
      setMessage(
        "조건 또는 AI 설정이 바뀌었습니다. 요청 내용을 다시 확인해 주세요.",
      );
    }
  });
  const confirm = () => run(() => confirmSelected(props, mounted, setMessage));
  const saveDirect = () =>
    run(() => saveDirectSelection(props, mounted, setMessage));
  return {
    busy: operation.busy,
    message: operation.message,
    prepare,
    confirm,
    saveDirect,
  };
}

function useSelectedOperation(props: SelectedGenerationProps) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const phase = useRef<"prepare" | "commit" | null>(null),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = async (
    operation: () => Promise<void>,
    nextPhase: "prepare" | "commit" = "commit",
  ) => {
    if (phase.current || props.selection.locked) return;
    phase.current = nextPhase;
    setBusy(true);
    props.onBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (reason) {
      if (mounted.current) setMessage(errorMessage(reason));
    } finally {
      phase.current = null;
      props.onBusy(false);
      if (mounted.current) {
        setBusy(false);
      }
    }
  };
  return { busy, message, setMessage, run, mounted, phase };
}

function useInitialSelectedPreparation(
  draft: SelectedGenerationProps["selection"]["draft"],
  prepare: () => Promise<void>,
) {
  const initialPreparation = useRef(false);
  const startup = useRef({ draft: draft, prepare });
  startup.current = { draft: draft, prepare };
  const automatic = Boolean(draft.value.prepareOnOpen);
  useEffect(() => {
    const { prepare } = startup.current;
    if (!automatic) {
      initialPreparation.current = false;
      return;
    }
    if (initialPreparation.current) return;
    initialPreparation.current = true;
    void prepare();
  }, [automatic]);
}
