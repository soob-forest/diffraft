import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import { type ReviewRow, utf16AtByte } from "./rows";

export function groupAtSelection(
  projection: ReviewProjection,
  selection: LogicalSelection,
) {
  const text =
    selection.side === "before" ? projection.before : projection.after;
  return projection.groups.find((group) => {
    const ranges =
      selection.side === "before" ? group.beforeRanges : group.afterRanges;
    return ranges.some((range) => {
      const from = utf16AtByte(text, range.from),
        to = utf16AtByte(text, range.to);
      return (
        selection.from >= from &&
        selection.to <= to &&
        (selection.from < to || from === to)
      );
    });
  });
}

export type GroupMark = { id: string; title: string; selected: boolean };
export function groupJumpSelection(
  projection: ReviewProjection,
  rows: ReviewRow[],
  groupId: string,
): LogicalSelection | null {
  for (const row of rows) {
    if (row.kind !== "insert" && row.kind !== "delete") continue;
    const side = row.kind === "delete" ? "before" : "after";
    const from = side === "before" ? row.beforeFrom : row.afterFrom;
    if (from === null) continue;
    const selection = { side, from, to: from } as const;
    if (groupAtSelection(projection, selection)?.id === groupId)
      return selection;
  }
  return null;
}

export function groupRowMarks(
  projection: ReviewProjection,
  rows: ReviewRow[],
  selectedId: string,
) {
  const marks = new Map<string, GroupMark>();
  for (const row of rows) {
    if (row.kind !== "insert" && row.kind !== "delete") continue;
    const side = row.kind === "delete" ? "before" : "after";
    const offset = side === "before" ? row.beforeFrom : row.afterFrom;
    if (offset === null) continue;
    const group = groupAtSelection(projection, {
      side,
      from: offset,
      to: offset,
    });
    if (!group) continue;
    const proposal = projection.batch.proposals.find(
      (p) => p.id === group.proposals[0]?.id,
    );
    marks.set(row.key, {
      id: group.id,
      title: proposal?.operation.headingPath.at(-1) || "문서",
      selected: group.id === selectedId,
    });
  }
  return marks;
}
