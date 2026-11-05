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
import type { RequestMode } from "./request-draft";
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
  kind: "generate";
  request: GenerateRequest;
  scope: ScopeSnapshot;
};
type PendingRewrite = {
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
): Promise<PendingGenerate>;
export function prepareRequest(
  props: GenerationProps,
  mode: "REWRITE",
  instruction: string,
): Promise<PendingRewrite>;
export function prepareRequest(
  props: GenerationProps,
  mode: RequestMode,
  instruction: string,
): Promise<PendingRequest>;
export async function prepareRequest(
  props: GenerationProps,
  mode: RequestMode,
  instruction: string,
): Promise<PendingRequest> {
  const error = draftError(instruction);
  if (error) throw new Error(error);
  if (mode !== "REWRITE") props.scope.value(props.model.content);
  return props.model.gate.run(async () => {
    await props.model.autosave.flush();
    await props.taskFlush.current?.();
    const head = props.model.autosave.document;
    const selection =
      mode === "REWRITE"
        ? { kind: "whole" as const }
        : props.scope.value(head.content);
    const [scope, review, model] = await readRequestContext(props, selection);
    if (review.generating)
      throw new Error(
        "진행 중인 요청을 완료하거나 중단한 뒤 다시 요청해 주세요.",
      );
    const common = requestBase(props, model, instruction);
    return requestForMode({
      mode,
      scope,
      selection,
      common,
      active: review.batches.find((batch) => batch.status === "ACTIVE"),
    });
  });
}

function requestForMode({
  mode,
  scope,
  selection,
  common,
  active,
}: {
  mode: RequestMode;
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
