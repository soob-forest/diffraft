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
import { useRequestInvalidation } from "./request-invalidation";
import { submitDraft } from "./submit-request";
import { useRequestDraft } from "./useRequestDraft";

export function useGeneration(props: GenerationProps) {
  const drafts = useDraftPersistence();
  const draft = useRequestDraft(props.model.state.document.id, props.taskId);
  const { pending, setPending } = draft;
  const operation = useGenerationOperation(props);
  const { prepare, generate, retry } = requestActions(
    props,
    draft,
    drafts,
    operation,
  );
  usePendingValidity({ props, pending, setPending, operation });
  useRequestInvalidation(() => {
    operation.contextRevision.current += 1;
    if (pending) {
      setPending(null);
      operation.setMessage(
        "조건 또는 AI 설정이 바뀌었습니다. 요청 내용을 다시 확인해 주세요.",
      );
    }
  });
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
        props.model.status.error ||
        props.model.status.saving ||
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
    props.model.status.error,
    props.model.status.saving,
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
  const contextRevision = useRef(0);
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
  return { busy, message, setMessage, run, send, active, contextRevision };
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

function requestActions(
  props: GenerationProps,
  draft: ReturnType<typeof useRequestDraft>,
  drafts: ReturnType<typeof useDraftPersistence>,
  operation: ReturnType<typeof useGenerationOperation>,
) {
  const { mode, instruction, setPending } = draft;
  const prepare = () =>
    operation.run(async () => {
      if (draft.locked) return;
      const revision = operation.contextRevision.current;
      const prepared = await prepareRequest(
        props,
        mode,
        instruction,
        draft.snapshot,
      );
      await drafts.flush();
      if (revision !== operation.contextRevision.current)
        throw new Error(
          "조건 또는 AI 설정이 바뀌었습니다. 요청 내용을 다시 확인해 주세요.",
        );
      if (operation.active.current) setPending(prepared);
    });
  const generate = () =>
    operation.run(() =>
      submitDraft(
        draft,
        operation.send,
        drafts.flush,
        () => operation.active.current,
      ),
    );
  const retry = (attempt: GenerationAttempt) =>
    operation.run(async () => {
      await drafts.flush();
      await operation.send(await prepareRetry(props, attempt));
    });
  return { prepare, generate, retry };
}
