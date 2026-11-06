import type { DraftStore } from "../drafts/store";
import { selectionIndexKey } from "../review/selected-draft-index";
import type { SelectedTarget } from "../review/selection-targets";
import { selectionTargetKey } from "../review/selection-targets";
import {
  EMPTY_SELECTED,
  type SelectedRequestDraft,
} from "../review/useSelectedRequest";
export function saveFirstSourceDraft(
  store: DraftStore,
  target: SelectedTarget,
  instruction: string,
  prepareOnOpen = false,
) {
  const key = selectionTargetKey(target);
  store.write(key, { ...EMPTY_SELECTED, target, instruction, prepareOnOpen });
  store.write(
    selectionIndexKey(target.documentId, target.selection.taskId, "source"),
    { instruction: "", key },
  );
}
export function activeSourceTarget(
  store: DraftStore,
  documentId: string,
  taskId: string,
) {
  const index = store.peek(selectionIndexKey(documentId, taskId, "source")) as
    | { key?: string }
    | undefined;
  if (!index?.key) return null;
  const draft = store.peek(index.key) as SelectedRequestDraft | undefined;
  return draft?.target?.kind === "confirmed" ? draft.target : null;
}
