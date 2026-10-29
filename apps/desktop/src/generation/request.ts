import { draftError } from "../drafts/validation";
import { editorCommand } from "../editor/api";
import type { FlushRef } from "../editor/DocumentWorkspace";
import type { RequestScope } from "../editor/request-scope";
import type { DocumentModel } from "../editor/useDocument";
import type { GenerateRequest } from "../generated/GenerateRequest";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { ScopeSnapshot } from "../generated/ScopeSnapshot";
import { reviewCommand } from "../review/api";
import { retryRequest } from "./state";

export type GenerationProps = {
  model: DocumentModel;
  taskId: string;
  taskFlush: FlushRef;
  scope: RequestScope;
  onProposal: () => void;
  onRewrite?: () => void;
};
export type PendingRequest = { request: GenerateRequest; scope: ScopeSnapshot };

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

export async function prepareRequest(
  props: GenerationProps,
  mode: "PATCH" | "EXPLAIN",
  instruction: string,
): Promise<PendingRequest> {
  const error = draftError(instruction);
  if (error) throw new Error(error);
  const selection = props.scope.value();
  return props.model.gate.run(async () => {
    await props.model.autosave.flush();
    await props.taskFlush.current?.();
    const head = props.model.autosave.document;
    const [scope, review] = await Promise.all([
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
    ]);
    if (review.generating)
      throw new Error(
        "진행 중인 요청을 완료하거나 중단한 뒤 다시 요청해 주세요.",
      );
    const active = review.batches.find((batch) => batch.status === "ACTIVE");
    return {
      scope,
      request: {
        documentId: head.id,
        taskId: props.taskId,
        expectedHeadId: head.versionId,
        operationId: crypto.randomUUID(),
        mode,
        selection,
        instruction,
        expectedActiveBatchId: active?.id ?? null,
        archivePrevious: mode === "PATCH" && Boolean(active),
        retryOf: null,
      },
    };
  });
}
