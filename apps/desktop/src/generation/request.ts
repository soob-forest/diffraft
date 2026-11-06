import { resolveModel } from "../connection/provider";
import { draftError } from "../drafts/validation";
import { editorCommand } from "../editor/api";
import type { FlushRef } from "../editor/DocumentWorkspace";
import type { RequestScope } from "../editor/request-scope";
import type { DocumentModel } from "../editor/useDocument";
import type { ConversationResult } from "../generated/ConversationResult";
import type { GenerateRequest } from "../generated/GenerateRequest";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { RewriteRequest } from "../generated/RewriteRequest";
import type { ScopeSnapshot } from "../generated/ScopeSnapshot";
import { reviewCommand } from "../review/api";
import type { SelectionSurface } from "../review/selected-draft-index";
import {
  type RequestDraft,
  type RequestMode,
  sameQuestion,
} from "./request-draft";
import { retryRequest } from "./state";

export type GenerationProps = {
  model: DocumentModel;
  taskId: string;
  taskFlush: FlushRef;
  scope: RequestScope;
  onProposal: () => void;
  onResult?: (result: ConversationResult) => void;
  onRewrite?: () => void;
  onSelectedDraft?: (surface: SelectionSurface) => void;
};
type PendingGenerate = {
  reviewSequence?: number;
  kind: "generate";
  request: GenerateRequest;
  scope: ScopeSnapshot;
};
type PendingRewrite = {
  referenceLabel?: string;
  reviewSequence?: number;
  kind: "rewrite";
  request: RewriteRequest;
  scope: ScopeSnapshot;
};
export type PendingRequest = PendingGenerate | PendingRewrite;

export async function prepareRetry(
  props: GenerationProps,
  attempt: GenerationAttempt,
) {
  return props.model.gate.run(async () => {
    await props.model.autosave.flush();
    await props.taskFlush.current?.();
    const review = await reviewCommand(
      { kind: "state", taskId: props.taskId },
      "state",
    );
    if (review.generating)
      throw new Error("진행 중인 요청을 완료하거나 중단해 주세요.");
    return retryRequest(
      attempt,
      props.model.autosave.document.versionId,
      crypto.randomUUID(),
      review.batches,
    );
  });
}

export function prepareRequest(
  props: GenerationProps,
  mode: "PATCH" | "EXPLAIN",
  instruction: string,
  target?: Pick<RequestDraft, "question" | "referenceBatchId">,
): Promise<PendingGenerate>;
export function prepareRequest(
  props: GenerationProps,
  mode: "REWRITE",
  instruction: string,
  target?: Pick<RequestDraft, "question" | "referenceBatchId">,
): Promise<PendingRewrite>;
export function prepareRequest(
  props: GenerationProps,
  mode: RequestMode,
  instruction: string,
  target?: Pick<RequestDraft, "question" | "referenceBatchId">,
): Promise<PendingRequest>;
export async function prepareRequest(
  props: GenerationProps,
  mode: RequestMode,
  instruction: string,
  target?: Pick<RequestDraft, "question" | "referenceBatchId">,
): Promise<PendingRequest> {
  const error = draftError(instruction);
  if (error) throw new Error(error);
  if (target?.question && mode !== "EXPLAIN")
    throw new Error(
      "변경 질문의 목적을 바꿀 수 없습니다. 확정본 대상으로 새 요청을 열어 주세요.",
    );
  if (mode !== "REWRITE" && !target?.question)
    props.scope.value(props.model.content);
  return props.model.gate.run(async () => {
    await props.model.autosave.flush();
    await props.taskFlush.current?.();
    const head = props.model.autosave.document;
    const selection =
      mode === "REWRITE" || target?.question
        ? { kind: "whole" as const }
        : props.scope.value(head.content);
    const [scope, review, model] = await readRequestContext(props, selection);
    if (review.generating)
      throw new Error(
        "진행 중인 요청을 완료하거나 중단한 뒤 다시 요청해 주세요.",
      );
    const common = requestBase(props, model, instruction);
    const prepared = requestForMode({
      mode,
      reviewSequence: review.sequence,
      scope,
      selection,
      common,
      active: review.batches.find((batch) => batch.status === "ACTIVE"),
    });
    await pinQuestion(prepared, target, props);
    if (prepared.kind === "rewrite") {
      prepared.request.referenceBatchId = target?.referenceBatchId ?? null;
      prepared.referenceLabel = review.batches.find(
        (batch) => batch.id === target?.referenceBatchId,
      )?.summary;
    }
    return prepared;
  });
}

function requestForMode({
  mode,
  reviewSequence,
  scope,
  selection,
  common,
  active,
}: {
  mode: RequestMode;
  reviewSequence: number;
  scope: ScopeSnapshot;
  selection: GenerateRequest["selection"];
  common: Pick<
    GenerateRequest,
    | "model"
    | "documentId"
    | "taskId"
    | "expectedHeadId"
    | "operationId"
    | "instruction"
    | "retryOf"
  >;
  active: import("../generated/BatchSummary").BatchSummary | undefined;
}): PendingRequest {
  if (mode === "REWRITE")
    return {
      kind: "rewrite",
      reviewSequence,
      scope,
      request: {
        ...common,
        expectedActiveBatchId: active?.id ?? null,
        referenceBatchId: null,
        archivePatch: active?.reviewMode === "CHANGES",
      },
    };
  return {
    kind: "generate",
    reviewSequence,
    scope,
    request: {
      ...common,
      mode,
      selection,
      expectedActiveBatchId: active?.id ?? null,
      archivePrevious: mode === "PATCH" && Boolean(active),
    },
  };
}

function requestBase(
  props: GenerationProps,
  model: GenerateRequest["model"],
  instruction: string,
) {
  const head = props.model.autosave.document;
  return {
    model,
    documentId: head.id,
    taskId: props.taskId,
    expectedHeadId: head.versionId,
    operationId: crypto.randomUUID(),
    instruction,
    retryOf: null,
  };
}

async function readRequestContext(
  props: GenerationProps,
  selection: GenerateRequest["selection"],
) {
  const head = props.model.autosave.document;
  return Promise.all([
    editorCommand(
      {
        kind: "scope",
        documentId: head.id,
        expectedVersion: head.version,
        selection,
      },
      "scope",
    ),
    reviewCommand({ kind: "state", taskId: props.taskId }, "state"),
    resolveModel(),
  ]);
}

async function pinQuestion(
  prepared: PendingRequest,
  target: Pick<RequestDraft, "question" | "referenceBatchId"> | undefined,
  props: GenerationProps,
) {
  if (prepared.kind !== "generate" || !target?.question) return;
  const question = await reviewCommand(
    {
      kind: "prepare_question",
      request: {
        documentId: props.model.state.document.id,
        taskId: props.taskId,
        batchId: target.question.batchId,
        subject: target.question.subject,
        expectedHeadId: prepared.request.expectedHeadId,
      },
    },
    "prepared_question",
  );
  if (!sameQuestion(question, target.question))
    throw new Error(
      "변경 내용이 바뀌었습니다. 검토에서 질문 대상을 다시 선택해 주세요.",
    );
  prepared.request.question = question;
  prepared.scope = { ...prepared.scope, text: "", blocks: [], from: 0, to: 0 };
}
