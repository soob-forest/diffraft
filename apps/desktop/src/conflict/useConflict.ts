import { useEffect, useRef, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { ConflictComparison } from "../generated/ConflictComparison";
import type { ResolutionChoice } from "../generated/ResolutionChoice";
import type { ResolutionRequest } from "../generated/ResolutionRequest";
import { errorMessage } from "../ipc";
import { conflictCommand, saveBufferCopy } from "./api";

type Comparison = ReturnType<typeof useComparison>;
export function useConflict(model: DocumentModel, onClose: () => void) {
  const comparison = useComparison(model);
  const actions = useConflictOperation(model);
  const resolve = useResolution(model, comparison, onClose);
  const copy = async () => {
    const path = await saveBufferCopy({
      documentId: comparison.documentId,
      content: comparison.appContent,
      operationId: crypto.randomUUID(),
    });
    if (!path) {
      actions.setMessage("사본 저장을 취소했습니다.");
      return;
    }
    model.autosave.preservedCopy(comparison.appContent);
    actions.setMessage(
      `사본 저장 완료: ${path}. 이제 닫거나 다른 문서를 열 수 있습니다. 원래 파일 충돌은 남아 있습니다.`,
    );
    await comparison.refresh();
  };
  const recover = async () => {
    await conflictCommand(
      { kind: "recover", documentId: comparison.documentId },
      "document",
    );
    await comparison.refresh();
    actions.setMessage(
      "저장 복구 결과를 불러왔습니다. 양쪽 내용을 확인해 주세요.",
    );
  };
  return {
    ...comparison,
    busy: actions.busy,
    message: actions.message || comparison.error,
    resolve: (choice: ResolutionChoice) => actions.run(() => resolve(choice)),
    copy: () => actions.run(copy),
    recover: () => actions.run(recover),
    refresh: () => actions.run(comparison.refresh),
  };
}

function useComparison(model: DocumentModel) {
  const [view, setView] = useState<ConflictComparison | null>(null);
  const [draft, setDraft] = useState(model.autosave.content);
  const [error, setError] = useState("");
  const appContent = useRef(model.autosave.content).current;
  const documentId = model.state.document.id;
  const refresh = () =>
    conflictCommand(
      { kind: "compare", documentId, appContent },
      "comparison",
    ).then(setView);
  useEffect(() => {
    let active = true;
    conflictCommand(
      { kind: "compare", documentId, appContent },
      "comparison",
    ).then(
      (value) => {
        if (active) setView(value);
      },
      (reason: unknown) => {
        if (active) setError(errorMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [documentId, appContent]);
  return { view, draft, setDraft, error, appContent, documentId, refresh };
}

function useConflictOperation(model: DocumentModel) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage("");
    try {
      await model.gate.run(operation);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { busy, message, setMessage, run };
}

function useResolution(
  model: DocumentModel,
  comparison: Comparison,
  onClose: () => void,
) {
  const pending = useRef<ResolutionRequest | null>(null);
  return async (choice: ResolutionChoice) => {
    const { view, documentId, appContent } = comparison;
    if (!view?.diskHash) return;
    const request: ResolutionRequest = {
      documentId,
      expectedHeadId: view.document.versionId,
      expectedDiskHash: view.diskHash,
      appContent,
      choice,
      operationId: "",
    };
    if (
      !pending.current ||
      JSON.stringify({ ...pending.current, operationId: "" }) !==
        JSON.stringify(request)
    )
      pending.current = { ...request, operationId: crypto.randomUUID() };
    const saved = await conflictCommand(
      { kind: "resolve", resolution: pending.current },
      "document",
    );
    model.adoptSaved(saved, true);
    onClose();
  };
}
