import { useState } from "react";
import { useSessionDraft } from "../drafts/SessionDrafts";
import type { GenerationAttempt } from "../generated/GenerationAttempt";

type RequestDraft = { mode: "PATCH" | "EXPLAIN"; instruction: string };
export function useRequestDraft(documentId: string, taskId: string) {
  const draft = useSessionDraft<RequestDraft>(
    JSON.stringify(["request", documentId, taskId]),
    { mode: "PATCH", instruction: "" },
  );
  const { mode, instruction } = draft.value;
  const [imported, setImported] = useState<string | null>(null);
  const setInstruction = (instruction: string) =>
    draft.set({ ...draft.value, instruction });
  return {
    mode,
    instruction,
    imported,
    setInstruction,
    setMode: (mode: RequestDraft["mode"]) =>
      draft.set({ ...draft.value, mode }),
    edit: (attempt: GenerationAttempt) => {
      const text = attempt.request.value.instruction;
      if (instruction && instruction !== text) setImported(text);
      else setInstruction(text);
    },
    discardImport: () => setImported(null),
    applyImport: () => {
      if (imported !== null) setInstruction(imported);
      setImported(null);
    },
  };
}
