import type { CandidateSelection } from "../generated/CandidateSelection";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import { utf16AtByte } from "./rows";

export type SelectedCandidateTarget = {
  documentId: string;
  batchId: string;
  proposalId: string;
  expectedRevision: number;
  expectedHeadId: string;
  selection: CandidateSelection;
  candidate: string;
  title: string;
};
export function selectedCandidateTarget(
  projection: ReviewProjection,
  selection: LogicalSelection | null,
): SelectedCandidateTarget {
  if (projection.batch.status !== "ACTIVE")
    throw new Error(
      "이전 기록은 읽기 전용입니다. 최신 검토에서 대상을 선택해 주세요.",
    );
  if (!selection || selection.from >= selection.to)
    throw new Error("제안 쪽에서 연속된 문장이나 문단을 선택해 주세요.");
  if (selection.side !== "after")
    throw new Error(
      "변경 전 문장은 참고 인용입니다. 제안 쪽에서 수정할 부분을 선택해 주세요.",
    );
  if (
    projection.batch.mode !== "PATCH" ||
    projection.currentHeadId !== projection.batch.applyHeadId
  )
    throw new Error("현재 기준의 유효한 부분 제안에서 선택해 주세요.");
  const target = candidateAtSelection(projection, selection);
  if (target) return target;
  throw new Error(
    "여러 제안 또는 변경 없는 문맥이 포함되어 있습니다. 한 제안의 내용 안에서 다시 선택해 주세요.",
  );
}
export function candidateAtSelection(
  projection: ReviewProjection,
  selection: LogicalSelection,
): SelectedCandidateTarget | null {
  if (projection.currentHeadId !== projection.batch.applyHeadId) return null;
  for (const group of projection.groups) {
    for (let index = 0; index < group.proposals.length; index++) {
      const range = group.afterRanges[index];
      const proposal = pendingProposal(projection, group.proposals[index]);
      if (!range || !proposal) continue;
      const from = utf16AtByte(projection.after, range.from),
        to = utf16AtByte(projection.after, range.to);
      if (selection.from < from || selection.to > to) continue;
      const candidate = proposal.operation.after;
      if (projection.after.slice(from, to) !== candidate) return null;
      const fromUtf16 = selection.from - from,
        toUtf16 = selection.to - from;
      return {
        documentId: projection.batch.documentId,
        batchId: projection.batch.id,
        proposalId: proposal.id,
        expectedRevision: proposal.revision,
        expectedHeadId: projection.currentHeadId,
        candidate,
        selection: {
          taskId: projection.batch.taskId,
          fromUtf16,
          toUtf16,
          quote: candidate.slice(fromUtf16, toUtf16),
        },
        title: proposal.operation.headingPath.at(-1) || "문서",
      };
    }
  }
  return null;
}

function pendingProposal(
  projection: ReviewProjection,
  reference: { id: string; revision: number },
) {
  const proposal = projection.batch.proposals.find(
    (p) => p.id === reference.id && p.revision === reference.revision,
  );
  if (proposal?.decision !== "PENDING" || proposal.validity !== "VALID")
    return null;
  return proposal;
}
