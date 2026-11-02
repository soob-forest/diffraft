import { useEffect, useRef, useState } from "react";
import { modelLabel } from "../connection/provider";
import { useDraftPersistence } from "../drafts/SessionDrafts";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import { errorMessage } from "../ipc";
import { openFailedSelectionDraft } from "../review/failed-selection-draft";
import { sendRequest } from "./api";
import {
  type GenerationProps,
  type PendingRequest,
  prepareRequest,
  prepareRetry,
} from "./request";
import { useRequestDraft } from "./useRequestDraft";

export function useGeneration(props: GenerationProps) {
  const drafts = useDraftPersistence();
  const draft = useRequestDraft(props.model.state.document.id, props.taskId);
  const { mode, instruction } = draft;
  const { pending, setPending } = draft;
  const operation = useGenerationOperation(props);
  const prepare = () =>
    operation.run(async () => {
      if (draft.locked) return;
      const prepared = await prepareRequest(props, mode, instruction);
      await drafts.flush();
      if (operation.active.current) setPending(prepared);
    });
  const generate = () =>
    operation.run(() => submitDraft(draft, operation.send, drafts.flush));
  const retry = (attempt: GenerationAttempt) =>
    operation.run(async () => {
      await drafts.flush();
      await operation.send(await prepareRetry(props, attempt));
    });
  usePendingValidity({ props, pending, setPending, operation });
  useInitialPreparation(draft, prepare);
  return {
    ...draft,
    edit: (attempt: GenerationAttempt) =>
      editRequest(props, draft, attempt, {
        store: drafts.store,
        setMessage: operation.setMessage,
      }),
    pending,
    prepare,
    generate,
    retry,
    close: () => setPending(null),
    ...operation,
  };
}

async function submitDraft(
  draft: ReturnType<typeof useRequestDraft>,
  send: (request: SavedGenerationRequest) => Promise<void>,
  flush: () => Promise<void>,
) {
  if (draft.locked || !draft.pending) return;
  const pending = draft.pending;
  const submitted = draft.beginSubmitted();
  try {
    await flush();
    await send(
      pending.kind === "rewrite"
        ? { kind: "rewrite", value: pending.request }
        : { kind: "generate", value: pending.request },
    );
    draft.clearSubmitted(submitted);
  } catch (reason) {
    draft.clearPending(submitted);
    throw reason;
  }
}

function usePendingValidity({
  props,
  pending,
  setPending,
  operation,
}: {
  props: GenerationProps;
  pending: PendingRequest | null;
  setPending: (value: PendingRequest | null) => void;
  operation: ReturnType<typeof useGenerationOperation>;
}) {
  useEffect(() => {
    if (
      pending &&
      (props.model.status.dirty ||
        props.model.autosave.document.versionId !==
          pending.request.expectedHeadId)
    ) {
      setPending(null);
      operation.setMessage(
        "문서가 변경되어 요청 확인을 닫았습니다. 범위를 다시 확인해 주세요.",
      );
    }
  }, [
    pending,
    props.model.status.dirty,
    props.model.autosave.document.versionId,
    operation.setMessage,
    setPending,
  ]);
}

function useGenerationOperation(props: GenerationProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (reason) {
      if (active.current) setMessage(errorMessage(reason));
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  };
  const send = async (request: SavedGenerationRequest) => {
    if (!active.current) return;
    setMessage(
      `${modelLabel(request.value.model)} · AI 응답을 기다리고 있습니다. 상단에서 중단할 수 있습니다.`,
    );
    const result = await sendRequest(request, (result) => {
      if (active.current) props.onResult?.(result);
    });
    if (!active.current) return;
    setMessage(
      result === "proposal"
        ? "새 제안을 저장했습니다. 비교 후 승인해 주세요."
        : "답변을 작업 대화에 저장했습니다.",
    );
    if (result === "proposal") props.onProposal();
  };
  return { busy, message, setMessage, run, send, active };
}

function useInitialPreparation(
  draft: ReturnType<typeof useRequestDraft>,
  prepare: () => Promise<void>,
) {
  const initialPreparation = useRef(false);
  const startup = useRef({ prepare, consume: draft.consumePreparation });
  startup.current = { prepare, consume: draft.consumePreparation };
  useEffect(() => {
    if (draft.prepareOnOpen && !initialPreparation.current) {
      initialPreparation.current = true;
      startup.current.consume();
      void startup.current.prepare();
    }
  }, [draft.prepareOnOpen]);
}

function editRequest(
  props: GenerationProps,
  draft: ReturnType<typeof useRequestDraft>,
  attempt: GenerationAttempt,
  context: Pick<ReturnType<typeof useDraftPersistence>, "store"> & {
    setMessage: (message: string) => void;
  },
) {
  try {
    if (
      openFailedSelectionDraft(context.store, attempt.request, {
        documentId: props.model.state.document.id,
        taskId: props.taskId,
      })
    )
      props.onSelectedDraft?.(
        attempt.request.kind === "selection" &&
          attempt.request.value.target.kind === "confirmed"
          ? "source"
          : "review",
      );
    else draft.edit(attempt);
  } catch (reason) {
    context.setMessage(errorMessage(reason));
  }
}
