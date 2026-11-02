import type { DraftStore } from "../drafts/store";
import type { CandidateSelection } from "../generated/CandidateSelection";
import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import { selectionIndexKey } from "./selected-draft-index";
import { isSelectionTargetKey, type SelectedTarget } from "./selection-targets";
import type { SelectedRequestDraft } from "./useSelectedRequest";

type SelectionIdentity = {
  kind: SelectedTarget["kind"];
  documentId: string;
  taskId: string;
  headId: string;
  selection: CandidateSelection;
  batchId?: string;
  proposalId?: string;
  revision?: number;
};

export function openFailedSelectionDraft(
  store: DraftStore,
  request: SavedGenerationRequest,
  owner: { documentId: string; taskId: string },
) {
  const identity = selectionIdentity(request);
  if (!identity) return false;
  if (
    identity.documentId !== owner.documentId ||
    identity.taskId !== owner.taskId
  )
    throw new Error("실패한 요청의 문서와 작업에서 초안을 열어 주세요.");
  const matches = [...store.entries()].filter(([key, value]) => {
    if (!key.startsWith('["selected-request",')) return false;
    if (typeof value !== "object" || value === null) return false;
    const target = (value as SelectedRequestDraft).target;
    return (
      target &&
      isSelectionTargetKey(key, target) &&
      matchesIdentity(target, identity)
    );
  });
  if (matches.length !== 1)
    throw new Error(
      "실패한 요청의 초안을 특정할 수 없습니다. 원래 검토에서 범위를 다시 선택해 주세요. 현재 초안은 유지됩니다.",
    );
  store.write(
    selectionIndexKey(
      owner.documentId,
      owner.taskId,
      identity.kind === "confirmed" ? "source" : "review",
    ),
    {
      instruction: "",
      key: matches[0][0],
    },
  );
  return true;
}

function selectionIdentity(
  request: SavedGenerationRequest,
): SelectionIdentity | null {
  const value = request.value;
  if (request.kind === "regenerate") {
    const target = request.value.options?.target;
    if (target?.kind !== "candidate_selection") return null;
    return {
      kind: "candidate",
      documentId: value.documentId,
      taskId: target.value.taskId,
      headId: value.expectedHeadId,
      selection: target.value,
      batchId: request.value.batchId,
      proposalId: request.value.proposalId,
      revision: request.value.expectedRevision,
    };
  }
  if (request.kind !== "selection") return null;
  const target = request.value.target;
  return {
    kind: target.kind,
    documentId: value.documentId,
    taskId: request.value.taskId,
    headId: value.expectedHeadId,
    selection:
      target.kind === "confirmed" ? target.value : target.value.selection,
    batchId: target.kind === "rewrite" ? target.value.batchId : undefined,
  };
}

function matchesIdentity(target: SelectedTarget, identity: SelectionIdentity) {
  if (
    target.documentId !== identity.documentId ||
    target.selection.taskId !== identity.taskId ||
    target.expectedHeadId !== identity.headId ||
    target.kind !== identity.kind
  )
    return false;
  if (!sameSelection(target.selection, identity.selection)) return false;
  if (target.kind === "candidate")
    return (
      target.batchId === identity.batchId &&
      target.proposalId === identity.proposalId &&
      target.expectedRevision === identity.revision
    );
  return target.kind === "confirmed" || target.batchId === identity.batchId;
}

function sameSelection(left: CandidateSelection, right: CandidateSelection) {
  return (
    left.fromUtf16 === right.fromUtf16 &&
    left.toUtf16 === right.toUtf16 &&
    left.quote === right.quote
  );
}
