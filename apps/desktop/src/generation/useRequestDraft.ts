import { useState } from "react";
import { useSessionDraft } from "../drafts/SessionDrafts";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import {
  type ImportedRequest,
  importConflicts,
  importRequest,
  originalRequest,
  type RequestDraft,
  receivePending,
  switchRequestMode,
} from "./request-draft";

export function useRequestDraft(documentId: string, taskId: string) {
  const draft = useSessionDraft<RequestDraft>(
    JSON.stringify(["request", documentId, taskId]),
    { mode: "PATCH", instruction: "" },
  );
  return {
    ...useFailedImport(draft),
    mode: draft.value.mode,
    instruction: draft.value.instruction,
    locked: draft.locked,
    snapshot: draft.value,
    beginSubmitted: () => {
      const submitted = { ...draft.value, pending: null };
      draft.replace(draft.value, submitted);
      return submitted;
    },
    pending: draft.value.pending ?? null,
    setPending: (pending: RequestDraft["pending"]) =>
      draft.update((current) => receivePending(current, pending)),
    clearPending: (submitted: RequestDraft) =>
      draft.replace(submitted, { ...submitted, pending: null }),
    prepareOnOpen: Boolean(draft.value.prepareOnOpen),
    consumePreparation: () =>
      draft.update((current) => ({ ...current, prepareOnOpen: false })),
    clearSubmitted: (submitted: RequestDraft) =>
      draft.replace(submitted, {
        ...submitted,
        instruction: "",
        pending: null,
        instructions: { ...submitted.instructions, [submitted.mode]: "" },
        prepareOnOpen: false,
      }),
    setInstruction: (instruction: string) =>
      draft.update((current) => ({
        ...current,
        instruction,
        pending: null,
        prepareOnOpen: false,
      })),
    setMode: (mode: RequestDraft["mode"]) =>
      draft.update((current) => switchRequestMode(current, mode)),
  };
}

function useFailedImport(
  draft: ReturnType<typeof useSessionDraft<RequestDraft>>,
) {
  const [imported, setImported] = useState<ImportedRequest | null>(null);
  return {
    imported,
    edit: (attempt: GenerationAttempt) => {
      if (draft.locked) return;
      draft.update((current) => {
        const original = originalRequest(attempt.request, current.mode);
        if (importConflicts(current, original)) {
          setImported(original);
          return current;
        }
        setImported(null);
        return importRequest(current, original);
      });
    },
    discardImport: () => setImported(null),
    applyImport: () => {
      if (imported !== null)
        draft.update((current) => importRequest(current, imported));
      setImported(null);
    },
  };
}
