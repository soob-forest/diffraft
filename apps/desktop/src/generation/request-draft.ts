import type { ChangeQuestion } from "../generated/ChangeQuestion";
import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import type { PendingRequest } from "./request";
export type RequestMode = "PATCH" | "EXPLAIN" | "REWRITE";
export type RequestDraft = {
  mode: RequestMode;
  editMode?: "PATCH" | "REWRITE";
  question?: ChangeQuestion;
  referenceBatchId?: string;
  instruction: string;
  instructions?: Partial<Record<RequestMode, string>>;
  prepareOnOpen?: boolean;
  pending?: PendingRequest | null;
};
export function switchRequestMode(
  draft: RequestDraft,
  mode: RequestMode,
): RequestDraft {
  if (mode === draft.mode) return draft;
  const instructions = {
    ...draft.instructions,
    [draft.mode]: draft.instruction,
  };
  return {
    ...draft,
    mode,
    editMode:
      mode === "EXPLAIN"
        ? (draft.editMode ?? (draft.mode === "REWRITE" ? "REWRITE" : "PATCH"))
        : mode,
    instructions,
    instruction: instructions[mode] ?? "",
    prepareOnOpen: false,
    pending: null,
  };
}
export type ImportedRequest = {
  mode: RequestMode;
  instruction: string;
  question?: ChangeQuestion;
  referenceBatchId?: string;
};
export function originalRequest(
  request: SavedGenerationRequest,
  fallback: RequestMode,
): ImportedRequest {
  const mode =
    request.kind === "rewrite"
      ? "REWRITE"
      : request.kind === "generate"
        ? request.value.mode
        : fallback;
  return {
    mode,
    instruction: request.value.instruction,
    question: request.kind === "generate" ? request.value.question : undefined,
    referenceBatchId:
      request.kind === "rewrite"
        ? (request.value.referenceBatchId ?? undefined)
        : undefined,
  };
}
export function importRequest(
  draft: RequestDraft,
  imported: ImportedRequest,
): RequestDraft {
  return {
    ...switchRequestMode(draft, imported.mode),
    instruction: imported.instruction,
    question: imported.question,
    referenceBatchId: imported.referenceBatchId,
    pending: null,
    prepareOnOpen: false,
  };
}
export function importConflicts(
  draft: RequestDraft,
  imported: ImportedRequest,
) {
  const destination = switchRequestMode(draft, imported.mode).instruction;
  return Boolean(destination && destination !== imported.instruction);
}
export function receivePending(
  draft: RequestDraft,
  pending: RequestDraft["pending"],
): RequestDraft {
  if (pending) {
    const mode = pending.kind === "rewrite" ? "REWRITE" : pending.request.mode;
    if (
      draft.mode !== mode ||
      draft.instruction !== pending.request.instruction ||
      (pending.kind === "generate" &&
        !sameQuestion(draft.question, pending.request.question)) ||
      (pending.kind === "rewrite" &&
        (draft.referenceBatchId ?? null) !== pending.request.referenceBatchId)
    )
      return draft;
  }
  return { ...draft, pending, prepareOnOpen: false };
}

export function sameQuestion(
  left: ChangeQuestion | undefined,
  right: ChangeQuestion | undefined,
) {
  return questionFingerprint(left) === questionFingerprint(right);
}
function questionFingerprint(question: ChangeQuestion | undefined) {
  if (!question) return "";
  const subject = question.subject;
  return JSON.stringify([
    question.documentId,
    question.taskId,
    question.batchId,
    question.baseVersionId,
    question.label,
    question.contentHash,
    subject.kind,
    subject.kind === "whole" ? null : [subject.id, subject.revision],
    question.changes.map((change) => [change.id, change.before, change.after]),
  ]);
}
