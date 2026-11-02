import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import type { PendingRequest } from "./request";
export type RequestMode = "PATCH" | "EXPLAIN" | "REWRITE";
export type RequestDraft = {
  mode: RequestMode;
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
    instructions,
    instruction: instructions[mode] ?? "",
    prepareOnOpen: false,
    pending: null,
  };
}
export type ImportedRequest = { mode: RequestMode; instruction: string };
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
  return { mode, instruction: request.value.instruction };
}
export function importRequest(
  draft: RequestDraft,
  imported: ImportedRequest,
): RequestDraft {
  return {
    ...switchRequestMode(draft, imported.mode),
    instruction: imported.instruction,
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
      draft.instruction !== pending.request.instruction
    )
      return draft;
  }
  return { ...draft, pending, prepareOnOpen: false };
}
