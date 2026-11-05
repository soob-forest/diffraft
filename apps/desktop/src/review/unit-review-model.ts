import type { ReviewBatch } from "../generated/ReviewBatch";
import type { ReviewUnit } from "../generated/ReviewUnit";

export function isUnitReview(batch: ReviewBatch) {
  return batch.mode === "REWRITE" && batch.reviewMode === "CHANGES";
}

export function repeatedDecisionKey(key: string, repeat: boolean) {
  return repeat && (key === "Enter" || key === " ");
}

export function unitDecision(batch: ReviewBatch, unit: ReviewUnit) {
  return (
    batch.proposals.find((proposal) => proposal.groupId === unit.id)
      ?.decision ?? "DISCARDED"
  );
}

export function unitCounts(batch: ReviewBatch) {
  const counts = { accepted: 0, rejected: 0, pending: 0 };
  for (const unit of batch.reviewUnits) {
    const decision = unitDecision(batch, unit);
    if (decision === "ACCEPTED") counts.accepted++;
    if (decision === "REJECTED") counts.rejected++;
    if (decision === "PENDING") counts.pending++;
  }
  return counts;
}

export function unitLabel(kind: string) {
  const labels: Record<string, string> = {
    addition: "추가",
    deletion: "삭제",
    modify: "수정",
    structure: "구조 변경",
    move: "문단 이동",
  };
  return labels[kind] ?? "변경";
}

export function decisionLabel(decision: string) {
  const labels: Record<string, string> = {
    PENDING: "미처리",
    ACCEPTED: "승인됨",
    REJECTED: "거절됨",
    DISCARDED: "취소됨",
  };
  return labels[decision] ?? decision;
}

export function nextPendingUnit(batch: ReviewBatch, id: string) {
  const units = [...batch.reviewUnits].sort((a, b) => a.number - b.number);
  const index = units.findIndex((unit) => unit.id === id);
  const ordered = [...units.slice(index + 1), ...units.slice(0, index)];
  return ordered.find((unit) => unitDecision(batch, unit) === "PENDING");
}

export function unitReferences(batch: ReviewBatch, unit: ReviewUnit) {
  return batch.proposals
    .filter((p) => p.groupId === unit.id)
    .map((p) => ({ id: p.id, revision: p.revision }));
}

export type UnitViewState = {
  version: 1;
  selectedId: string;
  filter: "all" | "pending" | "processed";
  split: boolean;
  full: boolean;
  whitespace: boolean;
  original: boolean;
  scrollKey: string;
  originalScrollKey: string;
};

export const initialUnitView: UnitViewState = {
  version: 1,
  selectedId: "",
  filter: "pending",
  split: false,
  full: false,
  whitespace: false,
  original: false,
  scrollKey: "",
  originalScrollKey: "",
};

export function filteredUnits(
  batch: ReviewBatch,
  filter: UnitViewState["filter"],
) {
  return batch.reviewUnits
    .filter(
      (unit) =>
        filter === "all" ||
        (unitDecision(batch, unit) === "PENDING") === (filter === "pending"),
    )
    .sort((a, b) => a.number - b.number);
}
export function normalizeUnitView(
  batch: ReviewBatch,
  value: UnitViewState,
): UnitViewState {
  const units = filteredUnits(batch, value.filter);
  const selected =
    units.find((unit) => unit.id === value.selectedId) ?? units[0];
  const selectedId = selected?.id ?? "";
  if (value.selectedId === selectedId) return value;
  return {
    ...value,
    selectedId,
    original: !!selected && unitDecision(batch, selected) !== "PENDING",
  };
}
export function adjacentUnit(
  units: ReviewUnit[],
  id: string | undefined,
  direction: number,
) {
  if (!units.length) return undefined;
  const index = units.findIndex((unit) => unit.id === id);
  if (index < 0) return units[0];
  return units[
    (index + (direction < 0 ? -1 : 1) + units.length) % units.length
  ];
}
export function unitFilterLabel(filter: UnitViewState["filter"]) {
  return { pending: "미처리", processed: "처리된", all: "전체" }[filter];
}
export function reopenedUnitView(batch: ReviewBatch, unit: ReviewUnit) {
  if (reopenSelectionState(batch, unit) !== "ready") return null;
  return { selectedId: unit.id, filter: "pending" as const, original: false };
}
export function reopenSelectionState(batch: ReviewBatch, unit: ReviewUnit) {
  const current = batch.reviewUnits.find((value) => value.id === unit.id);
  if (!current || batch.status !== "ACTIVE" || current.planId !== unit.planId)
    return "changed";
  if (current.reviewRevision <= unit.reviewRevision) return "waiting";
  return unitDecision(batch, current) === "PENDING" ? "ready" : "changed";
}
