import type { DocumentSnapshot } from "../generated/DocumentSnapshot";
import type { SelectedTarget } from "../review/selection-targets";
import {
  type CapturedSourceSelection,
  validateSourceSelection,
} from "./source-selection";

export function confirmedSourceTarget(
  document: DocumentSnapshot,
  taskId: string,
  captured: CapturedSourceSelection,
): Extract<SelectedTarget, { kind: "confirmed" }> {
  validateSourceSelection(captured, document.content);
  if (!taskId) throw new Error("수정 요청을 보관할 작업을 먼저 만들어 주세요.");
  return {
    kind: "confirmed",
    documentId: document.id,
    expectedHeadId: document.versionId,
    sourceVersion: document.version,
    candidate: document.content,
    title: "선택한 원문",
    selection: {
      taskId,
      fromUtf16: captured.selection.from,
      toUtf16: captured.selection.to,
      quote: captured.quote,
    },
  };
}
