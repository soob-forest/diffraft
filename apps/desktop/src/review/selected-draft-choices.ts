import type { DraftStore } from "../drafts/store";
import {
  isSelectionTargetKey,
  type SelectedTarget,
  selectionTargetKey,
} from "./selection-targets";
import type { SelectedRequestDraft } from "./useSelectedRequest";

export type SelectedDraftChoice = { key: string; value: SelectedRequestDraft };
export function selectedDraftChoices(
  store: DraftStore,
  target: SelectedTarget,
): SelectedDraftChoice[] {
  const exact = selectionTargetKey(target);
  return [...store.entries()].flatMap(([key, value]) => {
    if (
      !key.startsWith('["selected-request",') ||
      !value ||
      typeof value !== "object"
    )
      return [];
    const draft = value as SelectedRequestDraft,
      previous = draft.target;
    if (!previous || !isSelectionTargetKey(key, previous)) return [];
    const same =
      key === exact ||
      (target.kind === "confirmed" &&
        previous.kind === "confirmed" &&
        sameConfirmed(previous, target));
    return same ? [{ key, value: draft }] : [];
  });
}
function sameConfirmed(left: SelectedTarget, right: SelectedTarget) {
  return (
    left.documentId === right.documentId &&
    left.expectedHeadId === right.expectedHeadId &&
    left.selection.taskId === right.selection.taskId &&
    left.selection.fromUtf16 === right.selection.fromUtf16 &&
    left.selection.toUtf16 === right.selection.toUtf16 &&
    left.selection.quote === right.selection.quote
  );
}
