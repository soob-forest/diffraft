import type { DraftStore } from "../drafts/store";
import { isSelectionTargetKey } from "./selection-targets";
import type { SelectedRequestDraft } from "./useSelectedRequest";

export type SelectionSurface = "source" | "review";
type SelectionIndex = { instruction: string; key: string };
const EMPTY_INDEX: SelectionIndex = { instruction: "", key: "" };

export function selectionIndexKey(
  documentId: string,
  taskId: string,
  surface: SelectionSurface = "review",
) {
  return JSON.stringify([
    "selected-request",
    documentId,
    taskId,
    surface === "source" ? "source-active" : "active",
  ]);
}

export function selectionIndexSeed(
  store: DraftStore,
  documentId: string,
  taskId: string,
  surface: SelectionSurface,
) {
  const key = selectionIndexKey(documentId, taskId, surface);
  const legacy =
    surface === "source" && store.peek(key) === undefined
      ? legacySourceIndex(store, documentId, taskId)
      : null;
  return { key, initial: legacy ?? EMPTY_INDEX, migrate: Boolean(legacy) };
}

function legacySourceIndex(
  store: DraftStore,
  documentId: string,
  taskId: string,
) {
  const key = selectionIndexKey(documentId, taskId);
  if (store.isBlocked(key)) return null;
  const index = store.peek(key) as SelectionIndex | undefined;
  if (typeof index?.key !== "string" || store.isBlocked(index.key)) return null;
  const draft = store.peek(index.key) as SelectedRequestDraft | undefined;
  const target = draft?.target;
  return target?.kind === "confirmed" &&
    target.documentId === documentId &&
    target.selection.taskId === taskId &&
    isSelectionTargetKey(index.key, target)
    ? index
    : null;
}
