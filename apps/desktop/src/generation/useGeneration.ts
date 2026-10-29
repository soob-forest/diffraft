import { useEffect, useRef, useState } from "react";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import { errorMessage } from "../ipc";
import { sendRequest } from "./api";
import {
  type GenerationProps,
  type PendingRequest,
  prepareRequest,
  prepareRetry,
} from "./request";
import { useRequestDraft } from "./useRequestDraft";

export function useGeneration(props: GenerationProps) {
  const draft = useRequestDraft(props.model.state.document.id, props.taskId);
  const { mode, instruction } = draft;
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const operation = useGenerationOperation(props);
  const prepare = () =>
    operation.run(async () => {
      const prepared = await prepareRequest(props, mode, instruction);
      if (operation.active.current) setPending(prepared);
    });
  const generate = () =>
    operation.run(async () => {
      if (!pending) return;
      const request = pending.request;
      setPending(null);
      await operation.send({ kind: "generate", value: request });
    });
  const retry = (attempt: GenerationAttempt) =>
    operation.run(async () => {
      await operation.send(await prepareRetry(props, attempt));
    });
  usePendingValidity({ props, pending, setPending, operation });
  return {
    ...draft,
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
    setMessage("AI 응답을 기다리고 있습니다. 상단에서 중단할 수 있습니다.");
    const result = await sendRequest(request);
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
