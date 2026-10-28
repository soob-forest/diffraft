import { useEffect, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { VersionComparison } from "../generated/VersionComparison";
import { errorMessage } from "../ipc";
import { historyCommand } from "./api";

type Selection = { comparison: VersionComparison; operationId: string };
export function useHistory(model: DocumentModel) {
  const operation = useHistoryOperation(model);
  const selection = useHistorySelection(
    model,
    operation.busy,
    operation.setMessage,
  );
  return {
    selected: selection.selected,
    busy: operation.busy,
    message: operation.message,
    close: () => selection.setSelected(null),
    compare: (targetVersionId: string) =>
      operation.run(async () => {
        const comparison = await compare(model, targetVersionId);
        selection.setSelected({ comparison, operationId: crypto.randomUUID() });
      }),
    restore: () =>
      operation.run(async () => {
        if (!selection.selected) return;
        const message = await restore(model, selection.selected);
        selection.setSelected(null);
        operation.setMessage(message);
      }),
  };
}
function useHistorySelection(
  model: DocumentModel,
  busy: boolean,
  setMessage: (value: string) => void,
) {
  const [selected, setSelected] = useState<Selection | null>(null);
  useEffect(() => {
    if (!selected || busy) return;
    if (
      selected.comparison.currentHeadId !== model.autosave.document.versionId ||
      model.status.dirty ||
      model.status.error
    ) {
      setSelected(null);
      setMessage(
        "문서 상태가 바뀌어 복원 확인을 닫았습니다. 최신 내용과 다시 비교해 주세요.",
      );
    }
  }, [
    selected,
    busy,
    model.autosave.document.versionId,
    model.status.dirty,
    model.status.error,
    setMessage,
  ]);
  return { selected, setSelected };
}
function useHistoryOperation(model: DocumentModel) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await model.gate.run(operation);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, setMessage, run };
}
async function compare(model: DocumentModel, targetVersionId: string) {
  await model.autosave.flush();
  const head = model.autosave.document;
  return historyCommand(
    {
      kind: "compare",
      documentId: head.id,
      expectedHeadId: head.versionId,
      targetVersionId,
    },
    "comparison",
  );
}
async function restore(model: DocumentModel, selected: Selection) {
  await model.autosave.flush();
  const view = selected.comparison;
  const saved = await historyCommand(
    {
      kind: "restore",
      request: {
        documentId: view.documentId,
        expectedHeadId: view.currentHeadId,
        targetVersionId: view.target.id,
        operationId: selected.operationId,
      },
    },
    "document",
  );
  model.adoptSaved(saved);
  return `v${view.target.number} 내용을 새 v${saved.version}으로 복원했습니다. 이전 버전은 기록에 보존됩니다.`;
}
