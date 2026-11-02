import { useState } from "react";
import { useSessionDraft } from "../drafts/SessionDrafts";
import { serializeDraft } from "../drafts/serialization";
import type { ScopeSelection } from "../generated/ScopeSelection";
import type { EditorSelection } from "./SourceEditor";
import {
  type CapturedSourceSelection,
  validateSourceSelection,
} from "./source-selection";

export function selectedRange(
  kind: string,
  selection: EditorSelection,
): ScopeSelection {
  if (kind === "selection") {
    if (selection.from === selection.to)
      throw new Error(
        "선택 영역이 없습니다. 원문에서 범위를 다시 선택해 주세요.",
      );
    return { kind: "selection", from: selection.from, to: selection.to };
  }
  if (kind === "section") return { kind: "section", cursor: selection.cursor };
  if (kind === "whole") return { kind: "whole" };
  throw new Error("요청 범위를 다시 선택해 주세요.");
}

const INITIAL_SELECTION = { from: 0, to: 0, cursor: 0 };
export function selectionForEpoch(
  current: number,
  stored: { epoch: number; value: EditorSelection },
) {
  return current === stored.epoch ? stored.value : INITIAL_SELECTION;
}

export function useRequestScope(
  epoch: number,
  documentId: string,
  taskId: string,
) {
  const draft = useSessionDraft<{
    kind: string;
    captured: { epoch: number; value: CapturedSourceSelection } | null;
  }>(JSON.stringify(["source-scope", documentId, taskId]), {
    kind: "whole",
    captured: null,
  });
  const { kind, captured } = draft.value;
  const [stored, setStored] = useState({ epoch, value: INITIAL_SELECTION });
  const dragSelection = selectionForEpoch(epoch, stored);
  const selection = captured ? captured.value.selection : dragSelection;
  return {
    kind,
    locked: draft.locked,
    setKind: (value: string) => {
      draft.set({ kind: value, captured: null });
    },
    selection,
    dragSelection,
    capture: (value: CapturedSourceSelection) => {
      if (draft.locked)
        throw new Error(
          "저장된 범위 복구가 필요합니다. 하단의 초안 복구를 확인해 주세요.",
        );
      const next = { kind: "selection", captured: { epoch, value } };
      serializeDraft(next);
      draft.set(next);
    },
    setSelection: (value: EditorSelection) => setStored({ epoch, value }),
    value: (source?: string) => {
      if (draft.locked)
        throw new Error(
          "저장된 범위 복구가 필요합니다. 하단의 초안 복구를 확인해 주세요.",
        );
      if (captured && kind === "selection") {
        if (source === undefined)
          throw new Error("원문이 변경되었습니다. 범위를 다시 선택해 주세요.");
        return validateSourceSelection(captured.value, source);
      }
      return selectedRange(kind, selection);
    },
  };
}
export type RequestScope = ReturnType<typeof useRequestScope>;
