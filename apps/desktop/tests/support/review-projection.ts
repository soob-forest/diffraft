import type { Proposal } from "../../src/generated/Proposal";
import type { ReviewProjection } from "../../src/generated/ReviewProjection";

export function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "proposal1",
    revision: 1,
    groupId: "group1",
    operation: {
      range: { from: 0, to: 4 },
      blockId: "block1",
      headingPath: ["문서"],
      before: "원문",
      after: "새 후보",
      reason: "이유",
      requiresGroup: false,
    },
    decision: "PENDING",
    validity: "VALID",
    ...overrides,
  };
}

export function projection(proposals = [proposal()]): ReviewProjection {
  return {
    id: "projection1",
    currentHeadId: "head1",
    before: "원문",
    after: "새 후보",
    batch: {
      id: "batch1",
      taskId: "task1",
      documentId: "document1",
      baseVersionId: "head1",
      applyHeadId: "head1",
      status: "ACTIVE",
      mode: "PATCH",
      reviewMode: "CHANGES",
      reviewPlan: null,
      reviewUnits: [],
      patchReview: null,
      summary: "아직 미승인이라는 과거 AI 요약",
      candidateMarkdown: null,
      proposals,
    },
    groups: proposals
      .filter((p) => p.decision === "PENDING" && p.validity === "VALID")
      .map((p) => ({
        id: p.groupId,
        proposals: [{ id: p.id, revision: p.revision }],
        beforeRanges: [p.operation.range],
        afterRanges: [{ from: 0, to: 4 }],
        validity: "VALID",
      })),
    hunks: [],
    stats: { addedLines: 1, removedLines: 1, pendingGroups: proposals.length },
  };
}
