import { useEffect, useRef, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { ExportFileKind } from "../generated/ExportFileKind";
import type { ExportSnapshot } from "../generated/ExportSnapshot";
import { errorMessage } from "../ipc";
import { copyExport, prepareExport, saveExport } from "./actions";

export function useExport(model: DocumentModel) {
  const operation = useExportOperation(model);
  const [snapshot, setSnapshot] = useState<ExportSnapshot | null>(null);
  useInvalidation({
    model,
    snapshot,
    busy: operation.busy,
    invalidate: () => {
      setSnapshot(null);
      operation.setMessage(
        "문서 상태가 바뀌어 내보내기를 닫았습니다. 최신 내용으로 다시 열어 주세요.",
      );
    },
  });
  return {
    snapshot,
    busy: operation.busy,
    message: operation.message,
    close: () => setSnapshot(null),
    save: fileAction(model, operation, snapshot, setSnapshot),
    open: () =>
      operation.run(async () =>
        setSnapshot(await prepareExport(model.autosave)),
      ),
    copy: () =>
      operation.run(async () => {
        if (!snapshot) return;
        await copyExport(model.autosave, snapshot);
        operation.setMessage(
          `v${snapshot.document.version} 확정본 Markdown을 복사했습니다.`,
        );
      }),
  };
}

function fileAction(
  model: DocumentModel,
  operation: ReturnType<typeof useExportOperation>,
  snapshot: ExportSnapshot | null,
  setSnapshot: (value: ExportSnapshot) => void,
) {
  return (kind: ExportFileKind) =>
    operation.run(async () => {
      if (!snapshot) return;
      const saved = await saveExport(model.autosave, snapshot, kind);
      if (!saved) {
        operation.setMessage("파일 저장을 취소했습니다.");
        return;
      }
      if (kind === "working_file") {
        model.relocateSaved(saved.document);
        setSnapshot({ ...snapshot, document: saved.document });
      }
      operation.setMessage(
        `${kind === "copy" ? "확정본 사본 저장 완료" : "작업 파일 경로 변경 완료"}: ${saved.path}`,
      );
    });
}

function useExportOperation(model: DocumentModel) {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setMessage("");
    try {
      await model.gate.run(action);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      active.current = false;
      setBusy(false);
    }
  };
  return { busy, message, setMessage, run };
}

function useInvalidation({
  model,
  snapshot,
  busy,
  invalidate,
}: {
  model: DocumentModel;
  snapshot: ExportSnapshot | null;
  busy: boolean;
  invalidate: () => void;
}) {
  useEffect(() => {
    if (!snapshot || busy) return;
    const current = model.autosave.document;
    if (
      snapshot.document.versionId !== current.versionId ||
      snapshot.document.path !== current.path ||
      model.status.dirty ||
      model.status.error
    )
      invalidate();
  }, [
    snapshot,
    busy,
    model.autosave.document,
    model.status.dirty,
    model.status.error,
    invalidate,
  ]);
}
