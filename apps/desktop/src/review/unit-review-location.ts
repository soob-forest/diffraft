import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import { type ReviewRow, reviewRows, utf16AtByte } from "./rows";

type Bounds = Record<LogicalSelection["side"], { from: number; to: number }>;

export function unitLocation(
  comparison: ReviewProjection,
  id: string | undefined,
  index: number,
): LogicalSelection | null {
  const group = comparison.groups.find((group) => group.id === id),
    range = group?.beforeRanges[index],
    after = group?.afterRanges[index];
  if (!range || !after || !Number.isSafeInteger(index) || index < 0)
    return null;
  const bounds = {
    before: {
      from: utf16AtByte(comparison.before, range.from),
      to: utf16AtByte(comparison.before, range.to),
    },
    after: {
      from: utf16AtByte(comparison.after, after.from),
      to: utf16AtByte(comparison.after, after.to),
    },
  };
  for (const row of reviewRows(comparison, new Set(), false)) {
    const selection = changedLocation(row, bounds);
    if (selection) return selection;
  }
  return null;
}
function changedLocation(
  row: ReviewRow,
  bounds: Bounds,
): LogicalSelection | null {
  if (row.kind !== "delete" && row.kind !== "insert") return null;
  const side = row.kind === "delete" ? "before" : "after";
  const from = side === "before" ? row.beforeFrom : row.afterFrom;
  if (from === null || from < bounds[side].from || from >= bounds[side].to)
    return null;
  return { side, from, to: from };
}
