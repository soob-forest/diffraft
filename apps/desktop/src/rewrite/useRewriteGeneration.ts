import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { ReviewBatch } from "../generated/ReviewBatch";
import type { RewriteRequest } from "../generated/RewriteRequest";
import { errorMessage, SCHEMA_VERSION } from "../ipc";
import type { ReviewModel } from "../review/useReview";

export type RewriteFormProps = {
  model: DocumentModel;
  review: ReviewModel;
  taskId: string;
  flushTask: () => Promise<void>;
  onBusy: (value: boolean) => void;
};
export function useRewriteGeneration(props: RewriteFormProps) {
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState<RewriteRequest | null>(null);
  const operation = useGenerationOperation(props);
  const blocked = Boolean(
    props.review.state.generating ||
      props.review.loading ||
      props.review.error ||
      props.model.status.error,
  );
  usePendingValidity(props, pending, operation, setPending);
  const prepare = (reference: boolean) =>
    operation.run(async () => {
      const request = await prepareRequest(props, instruction, reference);
      if (operation.active.current) setPending(request);
    });
  const generate = () =>
    operation.run(async () => {
      if (!pending) return;
      const request = pending;
      setPending(null);
      operation.setMessage(
        "재작성 중입니다. 상단에서 생성을 중단할 수 있습니다.",
      );
      const batch = await generateCandidate(props, request, operation.active);
      if (!operation.active.current) return;
      props.review.setBatchId(batch.id);
      operation.setMessage(
        "새 재작성 후보를 저장했습니다. 비교 후 전체 적용해 주세요.",
      );
    });
  return {
    instruction,
    setInstruction,
    pending,
    prepare,
    generate,
    close: () => setPending(null),
    busy: operation.busy,
    blocked: blocked || operation.busy,
    message: operation.message,
  };
}

function useGenerationOperation(props: RewriteFormProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const active = useMounted();
  const run = async (operation: () => Promise<void>) => {
    if (!active.current || running.current || props.review.state.generating)
      return;
    running.current = true;
    setBusy(true);
    props.onBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      if (active.current) setMessage(errorMessage(error));
    } finally {
      running.current = false;
      if (active.current) {
        setBusy(false);
        props.onBusy(false);
        props.review.refresh();
      }
    }
  };
  return { busy, message, setMessage, run, active };
}

function useMounted() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}

function makeRequest(
  props: RewriteFormProps,
  instruction: string,
  reference: boolean,
): RewriteRequest {
  const active = props.review.state.batches.find(
    (batch) => batch.status === "ACTIVE",
  );
  return {
    documentId: props.model.autosave.document.id,
    taskId: props.taskId,
    expectedHeadId: props.model.autosave.document.versionId,
    expectedActiveBatchId: active?.id ?? null,
    referenceBatchId: reference
      ? (props.review.projection?.batch.id ?? null)
      : null,
    archivePatch: active?.mode === "PATCH",
    instruction: instruction.trim(),
    operationId: crypto.randomUUID(),
    retryOf: null,
  };
}
function usePendingValidity(
  props: RewriteFormProps,
  pending: RewriteRequest | null,
  operation: ReturnType<typeof useGenerationOperation>,
  setPending: (value: RewriteRequest | null) => void,
) {
  const active =
    props.review.state.batches.find((batch) => batch.status === "ACTIVE")?.id ??
    null;
  const head = props.model.autosave.document.versionId;
  const invalid = Boolean(
    props.model.status.dirty ||
      props.model.status.error ||
      props.review.state.generating,
  );
  const { busy, setMessage } = operation;
  useEffect(() => {
    if (
      pending &&
      !busy &&
      (invalid ||
        pending.expectedHeadId !== head ||
        pending.expectedActiveBatchId !== active)
    ) {
      setPending(null);
      setMessage(
        "문서 또는 제안이 변경되어 요청 확인을 닫았습니다. 최신 내용에서 다시 요청해 주세요.",
      );
    }
  }, [pending, busy, invalid, head, active, setPending, setMessage]);
}

async function prepareRequest(
  props: RewriteFormProps,
  instruction: string,
  reference: boolean,
) {
  return props.model.gate.run(async () => {
    await props.model.autosave.flush();
    await props.flushTask();
    return makeRequest(props, instruction, reference);
  });
}
async function generateCandidate(
  props: RewriteFormProps,
  pending: RewriteRequest,
  active: React.RefObject<boolean>,
) {
  await props.model.gate.run(async () => {
    await props.model.autosave.flush();
    await props.flushTask();
  });
  if (!active.current)
    throw new Error("작업 화면이 바뀌어 재작성을 시작하지 않았습니다.");
  return invoke<ReviewBatch>("generate_rewrite", {
    request: { schemaVersion: SCHEMA_VERSION },
    rewrite: pending,
  });
}
