import type { Proposal } from "../generated/Proposal";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { ReviewSide } from "../generated/ReviewSide";
import type { LogicalSelection } from "./coordinates";
import { utf16AtByte } from "./rows";

export function commentTarget(
  projection: ReviewProjection,
  proposal: Proposal,
  side: ReviewSide,
  selection: LogicalSelection | null,
) {
  const text =
    side === "before" ? proposal.operation.before : proposal.operation.after;
  const range = proposalRange(projection, proposal.id, side);
  if (range && selection?.side === side && selection.from < selection.to) {
    const source = side === "before" ? projection.before : projection.after;
    const start = utf16AtByte(source, range.from);
    const end = utf16AtByte(source, range.to);
    if (selection.from >= start && selection.to <= end)
      return {
        fromUtf16: selection.from - start,
        toUtf16: selection.to - start,
        quote: source.slice(selection.from, selection.to),
      };
  }
  return { fromUtf16: 0, toUtf16: text.length, quote: text };
}

function proposalRange(
  projection: ReviewProjection,
  proposalId: string,
  side: ReviewSide,
) {
  const group = projection.groups.find((g) =>
    g.proposals.some((p) => p.id === proposalId),
  );
  if (!group) return null;
  const index = group.proposals.findIndex((p) => p.id === proposalId);
  if (index < 0) return null;
  return (side === "before" ? group.beforeRanges : group.afterRanges)[index];
}
