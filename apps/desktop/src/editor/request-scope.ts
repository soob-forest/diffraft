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
type ScopeDraft = {
  kind: string;
  cursor?: number;
  captured: { epoch: number; value: CapturedSourceSelection } | null;
};
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
  const draft = useSessionDraft<ScopeDraft>(
    JSON.stringify(["source-scope", documentId, taskId]),
    {
      kind: "whole",
      captured: null,
    },
  );
  const { kind } = draft.value;
  const [stored, setStored] = useState({ epoch, value: INITIAL_SELECTION });
  const dragSelection = selectionForEpoch(epoch, stored);
  const selection = pinnedSelection(draft.value, dragSelection);
  return {
    kind,
    locked: draft.locked,
    setKind: (value: string) => {
      draft.set({ kind: value, captured: null, cursor: dragSelection.cursor });
    },
    selection,
    dragSelection,
    captureSection: (cursor: number) =>
      saveScope(draft, { kind: "section", captured: null, cursor }),
    capture: (value: CapturedSourceSelection) =>
      saveScope(draft, { kind: "selection", captured: { epoch, value } }),
    setSelection: (value: EditorSelection) => setStored({ epoch, value }),
    value: (source?: string) => readScope(draft, selection, source),
  };
}
export type RequestScope = ReturnType<typeof useRequestScope>;

function saveScope(
  draft: ReturnType<typeof useSessionDraft<ScopeDraft>>,
  next: ScopeDraft,
) {
  if (draft.locked)
    throw new Error(
      "저장된 범위 복구가 필요합니다. 하단의 초안 복구를 확인해 주세요.",
    );
  serializeDraft(next);
  draft.set(next);
}
function readScope(
  draft: ReturnType<typeof useSessionDraft<ScopeDraft>>,
  selection: EditorSelection,
  source?: string,
) {
  if (draft.locked)
    throw new Error(
      "저장된 범위 복구가 필요합니다. 하단의 초안 복구를 확인해 주세요.",
    );
  const { kind, captured, cursor } = draft.value;
  if (captured && kind === "selection") {
    if (source === undefined)
      throw new Error("원문이 변경되었습니다. 범위를 다시 선택해 주세요.");
    return validateSourceSelection(captured.value, source);
  }
  if (kind === "section" && cursor === undefined)
    throw new Error("섹션 대상을 다시 확인해 주세요.");
  return selectedRange(kind, selection);
}

function pinnedSelection(
  value: {
    kind: string;
    cursor?: number;
    captured: { value: CapturedSourceSelection } | null;
  },
  dragSelection: EditorSelection,
) {
  if (value.captured) return value.captured.value.selection;
  return value.kind === "section" && value.cursor !== undefined
    ? { from: value.cursor, to: value.cursor, cursor: value.cursor }
    : dragSelection;
}
