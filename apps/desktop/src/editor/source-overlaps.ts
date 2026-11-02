import type { ReviewProjection } from "../generated/ReviewProjection";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { reviewCommand } from "../review/api";
import { utf16AtByte } from "../review/rows";
import type { SelectedTarget } from "../review/selection-targets";

export type SourceOverlap = {
  taskId: string;
  goal: string;
  batchId: string;
  proposalId: string;
  revision: number;
};
export function projectionOverlaps(
  projection: ReviewProjection,
  target: SelectedTarget,
) {
  if (
    target.kind !== "confirmed" ||
    projection.currentHeadId !== target.expectedHeadId ||
    projection.batch.status !== "ACTIVE" ||
    projection.batch.mode !== "PATCH"
  )
    return [];
  return projection.groups.flatMap((group) =>
    group.proposals.filter((_, index) => {
      const range = group.beforeRanges[index];
      if (!range) return false;
      const from = utf16AtByte(projection.before, range.from),
        to = utf16AtByte(projection.before, range.to);
      return from === to
        ? from >= target.selection.fromUtf16 && from <= target.selection.toUtf16
        : from < target.selection.toUtf16 && to > target.selection.fromUtf16;
    }),
  );
}
export async function readSourceOverlaps(
  tasks: TaskSnapshot[],
  target: SelectedTarget,
): Promise<SourceOverlap[]> {
  const result: SourceOverlap[] = [];
  for (const task of tasks) {
    const state = await reviewCommand(
      { kind: "state", taskId: task.id },
      "state",
    );
    for (const batch of state.batches.filter(
      (value) => value.status === "ACTIVE" && value.mode === "PATCH",
    )) {
      const projection = await reviewCommand(
        {
          kind: "projection",
          batchId: batch.id,
          expectedHeadId: target.expectedHeadId,
        },
        "projection",
      );
      for (const proposal of projectionOverlaps(projection, target))
        result.push({
          taskId: task.id,
          goal: task.goal,
          batchId: batch.id,
          proposalId: proposal.id,
          revision: proposal.revision,
        });
    }
  }
  return result;
}
