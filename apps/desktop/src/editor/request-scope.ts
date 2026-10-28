import { useState } from "react";
import type { ScopeSelection } from "../generated/ScopeSelection";
import type { EditorSelection } from "./SourceEditor";

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

export function useRequestScope(epoch: number) {
  const [kind, setKind] = useState("whole");
  const [stored, setStored] = useState({ epoch, value: INITIAL_SELECTION });
  const selection = selectionForEpoch(epoch, stored);
  return {
    kind,
    setKind,
    selection,
    setSelection: (value: EditorSelection) => setStored({ epoch, value }),
    value: () => selectedRange(kind, selection),
  };
}
export type RequestScope = ReturnType<typeof useRequestScope>;
