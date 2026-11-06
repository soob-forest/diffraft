import { useState } from "react";
import { useDraftPersistence, useSessionDraft } from "../drafts/SessionDrafts";
import type { DraftStore } from "../drafts/store";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import { errorMessage } from "../ipc";
import {
  type ImportedRequest,
  importConflicts,
  importRequest,
  originalRequest,
  type RequestDraft,
  receivePending,
  switchRequestMode,
} from "./request-draft";
import { preserveRequestTarget, requestKey } from "./request-targets";

export function useRequestDraft(documentId: string, taskId: string) {
  const { store } = useDraftPersistence();
  const key = requestKey(documentId, taskId);
  const draft = useSessionDraft<RequestDraft>(key, {
    mode: "PATCH",
    instruction: "",
  });
  return {
    ...useFailedImport(draft, { store, key }),
    mode: draft.value.mode,
    editMode: draft.value.editMode,
    question: draft.value.question,
    referenceBatchId: draft.value.referenceBatchId,
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
  owner: { store: DraftStore; key: string },
) {
  const [imported, setImported] = useState<ImportedRequest | null>(null);
  const [importError, setImportError] = useState("");
  return {
    imported,
    importError,
    edit: (attempt: GenerationAttempt) => {
      if (draft.locked) return;
      draft.update((current) => {
        const original = originalRequest(attempt.request, current.mode);
        if (importConflicts(current, original)) {
          setImported(original);
          return current;
        }
        setImported(null);
        preserveRequestTarget(owner.store, owner.key, current);
        return importRequest(current, original);
      });
    },
    discardImport: () => setImported(null),
    applyImport: () => {
      if (imported) {
        const error = applyFailedImport(draft, imported, owner);
        setImportError(error);
        if (error) return;
      }
      setImported(null);
    },
  };
}

function applyFailedImport(
  draft: ReturnType<typeof useSessionDraft<RequestDraft>>,
  imported: ImportedRequest,
  owner: { store: DraftStore; key: string },
) {
  try {
    draft.update((current) => {
      preserveRequestTarget(owner.store, owner.key, current);
      return importRequest(current, imported);
    });
    return "";
  } catch (reason) {
    return errorMessage(reason);
  }
}
