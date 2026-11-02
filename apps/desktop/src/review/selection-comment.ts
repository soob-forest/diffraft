import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import { utf16AtByte } from "./rows";

export function selectedCommentProposal(
  projection: ReviewProjection,
  selection: LogicalSelection,
) {
  if (selection.from >= selection.to || projection.batch.status !== "ACTIVE")
    return null;
  const source =
    selection.side === "before" ? projection.before : projection.after;
  for (const group of projection.groups) {
    const ranges =
      selection.side === "before" ? group.beforeRanges : group.afterRanges;
    const index = ranges.findIndex(
      (range) =>
        selection.from >= utf16AtByte(source, range.from) &&
        selection.to <= utf16AtByte(source, range.to),
    );
    if (index >= 0) return group.proposals[index]?.id ?? null;
  }
  return null;
}
