import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import { reviewRows } from "./rows";
import {
  candidateAtSelection,
  type SelectedCandidateTarget,
} from "./selected-target";

type BaseTarget = Omit<
  SelectedCandidateTarget,
  "proposalId" | "expectedRevision"
>;
export type SelectedTarget =
  | (SelectedCandidateTarget & { kind: "candidate" })
  | (BaseTarget & { kind: "rewrite" })
  | (Omit<BaseTarget, "batchId"> & {
      kind: "confirmed";
      batchId?: string;
      sourceVersion?: number;
    });
export function selectedRequestTarget(
  projection: ReviewProjection,
  selection: LogicalSelection | null,
): SelectedTarget {
  if (
    projection.batch.mode === "REWRITE" &&
    projection.batch.reviewMode === "CHANGES"
  )
    throw new Error(
      "변경별 검토에서는 단위 승인·거절·코멘트를 사용해 주세요. 내용 수정은 최신 확정본에서 새 요청으로 진행합니다.",
    );
  if (projection.batch.status !== "ACTIVE")
    throw new Error(
      "이전 기록은 읽기 전용입니다. 최신 검토에서 새 요청을 준비해 주세요.",
    );
  if (selection?.side !== "after" || selection.from >= selection.to)
    throw new Error(
      "제안 쪽의 연속 범위를 다시 선택해 주세요. 변경 전 문장은 참고 인용입니다.",
    );
  if (selection.from < 0 || selection.to > projection.after.length)
    throw new Error("선택 범위를 다시 지정해 주세요.");
  if (projection.batch.mode === "REWRITE") {
    if (
      projection.batch.applyHeadId !== projection.currentHeadId ||
      projection.after !== projection.batch.candidateMarkdown
    )
      throw new Error(
        "재작성 후보의 기준이 바뀌었습니다. 최신 확정본에서 새 요청을 준비해 주세요.",
      );
    return baseTarget(projection, selection, "rewrite", projection.after);
  }
  const candidate = candidateAtSelection(projection, selection);
  if (candidate) return { ...candidate, kind: "candidate" };
  const confirmed = confirmedSelection(projection, selection);
  return baseTarget(projection, confirmed, "confirmed", projection.before);
}
function baseTarget(
  projection: ReviewProjection,
  selection: LogicalSelection,
  kind: "confirmed" | "rewrite",
  candidate: string,
): SelectedTarget {
  return {
    kind,
    documentId: projection.batch.documentId,
    batchId: projection.batch.id,
    expectedHeadId: projection.currentHeadId,
    selection: {
      taskId: projection.batch.taskId,
      fromUtf16: selection.from,
      toUtf16: selection.to,
      quote: candidate.slice(selection.from, selection.to),
    },
    candidate,
    title:
      kind === "rewrite" ? "전체 재작성 후보" : "현재 확정본의 새 부분 제안",
  };
}
function confirmedSelection(
  projection: ReviewProjection,
  selection: LogicalSelection,
): LogicalSelection {
  const rows = reviewRows(projection, new Set(), true).filter(
    (row) =>
      row.afterFrom !== null &&
      row.afterFrom < selection.to &&
      row.afterFrom + row.raw.length > selection.from,
  );
  const first = rows[0],
    last = rows.at(-1);
  if (
    !first ||
    !last ||
    rows.some((row) => row.kind !== "equal" || row.beforeFrom === null)
  )
    throw ambiguous();
  for (let index = 1; index < rows.length; index++)
    if (
      rows[index - 1].beforeFrom === null ||
      rows[index].beforeFrom !==
        Number(rows[index - 1].beforeFrom) + rows[index - 1].raw.length
    )
      throw ambiguous();
  const from =
      Number(first.beforeFrom) + selection.from - Number(first.afterFrom),
    to = Number(last.beforeFrom) + selection.to - Number(last.afterFrom);
  if (
    projection.before.slice(from, to) !==
    projection.after.slice(selection.from, selection.to)
  )
    throw ambiguous();
  return { side: "after", from, to };
}
function ambiguous() {
  return new Error(
    "여러 제안·삭제·추가가 섞여 있습니다. 한 후보 또는 변경 없는 연속 문맥에서 다시 선택해 주세요.",
  );
}
export function selectionTargetKey(target: SelectedTarget) {
  if (target.kind === "confirmed")
    return JSON.stringify([
      "selected-request",
      target.documentId,
      target.selection.taskId,
      "confirmed",
      target.expectedHeadId,
      `${target.selection.fromUtf16}:${target.selection.toUtf16}`,
    ]);
  return legacySelectionTargetKey(target);
}
export function legacySelectionTargetKey(target: SelectedTarget) {
  return JSON.stringify([
    "selected-request",
    target.documentId,
    target.selection.taskId,
    target.batchId,
    target.kind === "candidate" ? target.proposalId : target.kind,
    target.kind === "candidate"
      ? String(target.expectedRevision)
      : target.expectedHeadId,
    `${target.selection.fromUtf16}:${target.selection.toUtf16}`,
  ]);
}
export function isSelectionTargetKey(key: string, target: SelectedTarget) {
  return (
    key === selectionTargetKey(target) ||
    (typeof target.batchId === "string" &&
      key === legacySelectionTargetKey(target))
  );
}
